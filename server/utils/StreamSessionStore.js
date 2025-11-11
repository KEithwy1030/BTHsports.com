class StreamSessionStore {
  constructor() {
    this.sessions = new Map();
    this.ttl = 15 * 60 * 1000; // 15分钟
  }

  set(streamId, data) {
    if (!streamId) return;
    this.sessions.set(streamId.toString(), {
      ...data,
      updatedAt: Date.now()
    });
  }

  get(streamId) {
    if (!streamId) return null;
    const key = streamId.toString();
    const record = this.sessions.get(key);
    if (!record) return null;
    if (Date.now() - record.updatedAt > this.ttl) {
      this.sessions.delete(key);
      return null;
    }
    return record;
  }

  delete(streamId) {
    if (!streamId) return;
    this.sessions.delete(streamId.toString());
  }
}

module.exports = new StreamSessionStore();

