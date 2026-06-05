import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  INCOMING_REPLY_CATEGORIES,
  REPLY_FILE_TYPES,
} from './whatsapp-incoming-reply.constants.js';
import {
  parseIncomingReply,
  getAutomationReplyType,
  toAutomationReplyFields,
} from './whatsapp-incoming-reply.parser.js';
import { parseIncomingMessage } from './whatsapp-message-handler.js';
import automationEngine from './automation-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samples = JSON.parse(
  readFileSync(join(__dirname, 'whatsapp-incoming-reply.samples.json'), 'utf8'),
);

function getMessageFromSample(sampleKey) {
  return samples[sampleKey].payload.entry[0].changes[0].value.messages[0];
}

describe('parseIncomingReply', () => {
  it('parses template quick-reply (Custom) as type button, not interactive', () => {
    const message = getMessageFromSample('template_quick_reply_custom');
    const reply = parseIncomingReply(message);

    assert.equal(reply.category, INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY);
    assert.equal(reply.id, 'تأكيد الاوردر');
    assert.equal(reply.title, 'تأكيد الاوردر');
    assert.equal(reply.payload, 'تأكيد الاوردر');
    assert.equal(reply.metaMessageType, 'button');
    assert.equal(reply.metaInteractiveType, null);
    assert.equal(reply.fileType, REPLY_FILE_TYPES.template_quick_reply);
  });

  it('parses interactive button_reply separately from template quick-reply', () => {
    const message = getMessageFromSample('interactive_button_reply');
    const reply = parseIncomingReply(message);

    assert.equal(reply.category, INCOMING_REPLY_CATEGORIES.INTERACTIVE_BUTTON_REPLY);
    assert.equal(reply.id, 'fabc123___btn_1');
    assert.equal(reply.title, 'Loved it');
    assert.equal(reply.payload, null);
    assert.equal(reply.metaMessageType, 'interactive');
    assert.equal(reply.metaInteractiveType, 'button_reply');
    assert.equal(reply.fileType, 'button_reply');
  });

  it('parses interactive list_reply', () => {
    const message = getMessageFromSample('interactive_list_reply');
    const reply = parseIncomingReply(message);

    assert.equal(reply.category, INCOMING_REPLY_CATEGORIES.INTERACTIVE_LIST_REPLY);
    assert.equal(reply.id, 'fabc123___item_1');
    assert.equal(reply.title, 'Option A');
    assert.equal(reply.description, 'First list option');
    assert.equal(reply.fileType, 'list_reply');
  });

  it('returns null for plain text messages', () => {
    const reply = parseIncomingReply({
      type: 'text',
      text: { body: 'Hello' },
    });
    assert.equal(reply, null);
  });
});

describe('getAutomationReplyType', () => {
  it('exposes template_quick_reply for template buttons', () => {
    const reply = parseIncomingReply(getMessageFromSample('template_quick_reply_custom'));
    assert.equal(getAutomationReplyType(reply), INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY);
  });

  it('keeps button_reply alias for interactive buttons (backward compatibility)', () => {
    const reply = parseIncomingReply(getMessageFromSample('interactive_button_reply'));
    assert.equal(getAutomationReplyType(reply), 'button_reply');
  });
});

describe('parseIncomingMessage integration', () => {
  it('assigns template_quick_reply fileType for template buttons', () => {
    const parsed = parseIncomingMessage(getMessageFromSample('template_quick_reply_custom'));
    assert.equal(parsed.fileType, 'template_quick_reply');
    assert.equal(parsed.incomingReply.category, INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY);
    assert.equal(parsed.content, 'تأكيد الاوردر');
  });

  it('assigns button_reply fileType for interactive buttons only', () => {
    const parsed = parseIncomingMessage(getMessageFromSample('interactive_button_reply'));
    assert.equal(parsed.fileType, 'button_reply');
    assert.equal(parsed.incomingReply.category, INCOMING_REPLY_CATEGORIES.INTERACTIVE_BUTTON_REPLY);
  });
});

describe('automation-engine condition evaluation', () => {
  it('matches template quick-reply title via quick_reply.title', () => {
    const message = getMessageFromSample('template_quick_reply_custom');
    const fields = toAutomationReplyFields(parseIncomingReply(message));
    const data = {
      message: fields.interactive_reply_title,
      messagePayload: message,
      ...fields,
      interactiveReplyId: fields.interactive_reply_id,
      interactiveReplyTitle: fields.interactive_reply_title,
      interactiveReplyType: fields.interactive_reply_type,
    };

    assert.equal(
      automationEngine.evaluateCondition(
        { field: 'quick_reply.title', operator: 'equals', value: 'تأكيد الاوردر' },
        data,
      ),
      true,
    );
    assert.equal(
      automationEngine.evaluateCondition(
        { field: 'quick_reply.type', operator: 'equals', value: INCOMING_REPLY_CATEGORIES.TEMPLATE_QUICK_REPLY },
        data,
      ),
      true,
    );
  });

  it('matches interactive button id via quick_reply.id (backward compatible)', () => {
    const message = getMessageFromSample('interactive_button_reply');
    const fields = toAutomationReplyFields(parseIncomingReply(message));
    const data = {
      message: fields.interactive_reply_title,
      messagePayload: message,
      ...fields,
      interactiveReplyId: fields.interactive_reply_id,
      interactiveReplyTitle: fields.interactive_reply_title,
      interactiveReplyType: fields.interactive_reply_type,
    };

    assert.equal(
      automationEngine.evaluateCondition(
        { field: 'quick_reply.id', operator: 'equals', value: 'fabc123___btn_1' },
        data,
      ),
      true,
    );
    assert.equal(
      automationEngine.evaluateCondition(
        { field: 'quick_reply.type', operator: 'equals', value: 'button_reply' },
        data,
      ),
      true,
    );
  });

  it('does not treat template quick-reply as interactive button_reply type', () => {
    const message = getMessageFromSample('template_quick_reply_custom');
    const fields = toAutomationReplyFields(parseIncomingReply(message));
    const data = {
      message: fields.interactive_reply_title,
      messagePayload: message,
      ...fields,
      interactiveReplyType: fields.interactive_reply_type,
    };

    assert.equal(
      automationEngine.evaluateCondition(
        { field: 'quick_reply.type', operator: 'equals', value: 'button_reply' },
        data,
      ),
      false,
    );
  });
});
