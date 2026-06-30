import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EtherpadApiClient, EtherpadService, buildEtherpadSessionCookie } from '../src/etherpad/api.js';

function makeMockServer(responses) {
  let calls = [];
  return {
    calls,
    async fetch(url) {
      const parsed = new URL(url);
      calls.push({ path: parsed.pathname, params: Object.fromEntries(parsed.searchParams) });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return {
        ok: response.ok ?? true,
        text: async () => response.text ?? '',
        json: async () => response.json,
      };
    },
  };
}

test('EtherpadApiClient throws when API key is missing', () => {
  assert.throws(() => new EtherpadApiClient({ baseUrl: 'http://localhost:9001' }), /ETHERPAD_API_KEY/);
});

test('createGroup calls the correct endpoint', async () => {
  const server = makeMockServer([
    { json: { code: 0, data: { groupID: 'g.abc123' } } },
  ]);
  const client = new EtherpadApiClient({ baseUrl: 'http://localhost:9001', apiKey: 'secret' });
  client._fetch = server.fetch.bind(server);

  const data = await client.createGroup();
  assert.equal(data.groupID, 'g.abc123');
  assert.equal(server.calls[0].path, '/api/1/createGroup');
  assert.equal(server.calls[0].params.apikey, 'secret');
});

test('createAuthorIfNotExistsFor passes mapper and name', async () => {
  const server = makeMockServer([
    { json: { code: 0, data: { authorID: 'a.xyz789' } } },
  ]);
  const client = new EtherpadApiClient({ baseUrl: 'http://localhost:9001', apiKey: 'secret' });
  client._fetch = server.fetch.bind(server);

  const data = await client.createAuthorIfNotExistsFor('student:42', 'Alice');
  assert.equal(data.authorID, 'a.xyz789');
  assert.equal(server.calls[0].params.authorMapper, 'student:42');
  assert.equal(server.calls[0].params.name, 'Alice');
});

test('ensureTeacherAuthor maps teacher identity', async () => {
  const server = makeMockServer([
    { json: { code: 0, data: { authorID: 'a.teacher1' } } },
  ]);
  const service = new EtherpadService({ baseUrl: 'http://localhost:9001', apiKey: 'secret' });
  service.api._fetch = server.fetch.bind(server);

  const authorId = await service.ensureTeacherAuthor(7, 'Teacher');
  assert.equal(authorId, 'a.teacher1');
  assert.equal(server.calls[0].params.authorMapper, 'teacher:7');
  assert.equal(server.calls[0].params.name, 'Teacher');
});

test('createSession returns session id and validUntil', async () => {
  const server = makeMockServer([
    { json: { code: 0, data: { sessionID: 's.sess123' } } },
  ]);
  const service = new EtherpadService({ baseUrl: 'http://localhost:9001', apiKey: 'secret' });
  service.api._fetch = server.fetch.bind(server);

  const now = Math.floor(Date.now() / 1000);
  const result = await service.createSessionCookie('g.abc', 'a.xyz');
  assert.equal(result.sessionID, 's.sess123');
  assert.ok(result.validUntil > now);
  assert.equal(server.calls[0].params.groupID, 'g.abc');
  assert.equal(server.calls[0].params.authorID, 'a.xyz');
});

test('createAssignmentPad appends optional random suffix to pad id', async () => {
  const server = makeMockServer([
    { json: { code: 0, data: { groupID: 'g.class1' } } },
    { json: { code: 0, data: { padID: 'g.class1$a2_s5_K4821' } } },
  ]);
  const service = new EtherpadService({ baseUrl: 'http://localhost:9001', apiKey: 'secret' });
  service.api._fetch = server.fetch.bind(server);

  const padId = await service.createAssignmentPad(1, 2, 5, 'Hello', 'K4821');
  assert.equal(padId, 'g.class1$a2_s5_K4821');
  assert.equal(server.calls[1].params.groupID, 'g.class1');
  assert.equal(server.calls[1].params.padName, 'a2_s5_K4821');
  assert.equal(server.calls[1].params.text, 'Hello');
});

test('getPadText returns pad text', async () => {
  const server = makeMockServer([
    { json: { code: 0, data: { text: 'Draft body' } } },
  ]);
  const service = new EtherpadService({ baseUrl: 'http://localhost:9001', apiKey: 'secret' });
  service.api._fetch = server.fetch.bind(server);

  const text = await service.getPadText('g.class1$a2_s5');
  assert.equal(text, 'Draft body');
  assert.equal(server.calls[0].path, '/api/1/getText');
  assert.equal(server.calls[0].params.padID, 'g.class1$a2_s5');
});

test('buildEtherpadSessionCookie formats cookie value', () => {
  assert.equal(buildEtherpadSessionCookie('s.sess123'), 'sessionID=s.sess123');
});

test('EtherpadApiClient surfaces API error codes', async () => {
  const server = makeMockServer([
    { json: { code: 1, message: 'padID does already exist' } },
  ]);
  const client = new EtherpadApiClient({ baseUrl: 'http://localhost:9001', apiKey: 'secret' });
  client._fetch = server.fetch.bind(server);

  await assert.rejects(
    () => client.getText('g.1$pad'),
    /padID does already exist/
  );
});
