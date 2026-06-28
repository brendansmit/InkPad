import crypto from 'node:crypto';

/**
 * Thin client for Etherpad's HTTP API.
 *
 * Environment variables:
 *   ETHERPAD_API_URL  - base URL of the Etherpad API (default: http://127.0.0.1:9001)
 *   ETHERPAD_API_KEY  - the API key from Etherpad's APIKEY.txt
 *
 * Etherpad API docs: https://etherpad.org/doc/v1.8.18/#index_http_api
 */
export class EtherpadApiClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.ETHERPAD_API_URL ?? 'http://127.0.0.1:9001').replace(/\/$/, '');
    this.apiKey = options.apiKey ?? process.env.ETHERPAD_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('ETHERPAD_API_KEY is not set');
    }
  }

  async call(method, params = {}) {
    const url = new URL(`${this.baseUrl}/api/1/${method}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    url.searchParams.set('apikey', this.apiKey);

    const response = await (this._fetch ?? fetch)(url.toString(), { method: 'GET' });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Etherpad API ${method} failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`Etherpad API ${method} returned code ${data.code}: ${data.message}`);
    }
    return data.data;
  }

  async createGroup() {
    return this.call('createGroup');
  }

  async createGroupIfNotExistsFor(groupMapper) {
    return this.call('createGroupIfNotExistsFor', { groupMapper });
  }

  async createAuthor(name) {
    return this.call('createAuthor', { name });
  }

  async createAuthorIfNotExistsFor(authorMapper, name) {
    const params = { authorMapper };
    if (name !== undefined) params.name = name;
    return this.call('createAuthorIfNotExistsFor', params);
  }

  async createSession(groupID, authorID, validUntil) {
    return this.call('createSession', { groupID, authorID, validUntil });
  }

  async createGroupPad(groupID, padName, text) {
    const params = { groupID, padName };
    if (text !== undefined) params.text = text;
    return this.call('createGroupPad', params);
  }

  async getText(padID) {
    return this.call('getText', { padID });
  }

  async setText(padID, text) {
    return this.call('setText', { padID, text });
  }
}

/**
 * High-level helpers that map InkHeron concepts to Etherpad primitives.
 */
export class EtherpadService {
  constructor(options = {}) {
    this.api = new EtherpadApiClient(options);
  }

  /**
   * Ensure a group exists for the given class. We use the class id as the stable mapper.
   */
  async ensureClassGroup(classId) {
    const result = await this.api.createGroupIfNotExistsFor(`class:${classId}`);
    return result.groupID;
  }

  /**
   * Ensure an author exists for the given student. We use the student id as the stable mapper.
   */
  async ensureStudentAuthor(studentId, displayName) {
    const result = await this.api.createAuthorIfNotExistsFor(`student:${studentId}`, displayName);
    return result.authorID;
  }

  /**
   * Create a session cookie value for an author in a group.
   * validUntil is a Unix timestamp in seconds (default: 2 hours from now).
   */
  async createSessionCookie(groupId, authorId, validUntil) {
    const until = validUntil ?? Math.floor(Date.now() / 1000) + 2 * 60 * 60;
    const result = await this.api.createSession(groupId, authorId, until);
    return { sessionID: result.sessionID, validUntil: until };
  }

  /**
   * Create a new group pad for an assignment. Returns the full pad id (groupID$padName).
   */
  async createAssignmentPad(classId, assignmentId, studentId, initialText) {
    const groupId = await this.ensureClassGroup(classId);
    const padName = `a${assignmentId}_s${studentId}`;
    await this.api.createGroupPad(groupId, padName, initialText);
    return `${groupId}$${padName}`;
  }
}

/**
 * Build the session cookie string that Etherpad expects.
 */
export function buildEtherpadSessionCookie(sessionId) {
  return `sessionID=${sessionId}`;
}

/**
 * Generate a deterministic but opaque-looking etherpad_pad_id for storage in our DB.
 */
export function generatePadRecordId() {
  return crypto.randomUUID();
}
