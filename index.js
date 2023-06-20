const { Transform } = require("stream");
const oracledb = require("oracledb");
const { recursive } = require("merge");

let initialized = false;

class Database {
  constructor({
    host = "localhost",
    port = 1521,
    user = "sysadmin",
    password,
    service = "ORCL",
    clientPath,
    ...options
  }) {
    if (!initialized) {
      oracledb.initOracleClient(clientPath ? { libDir: clientPath } : undefined);
      initialized = true;
    }

    const defaultConfig = {
      connectString: `${host}:${port}/${service}`,
      user: user,
      password: password,
      service: service
    };

    this.config = recursive(defaultConfig, options);
  }

  async open() {
    this.connection = await oracledb.getConnection(this.config);
  }

  async close() {
    if (this.connection) {
      await this.connection.close();
    }
  }

  async execute(sql, params = {}) {
    const bindVars = extractParams(params);
    const response = await this.connection.execute(sql, bindVars, { autoCommit: true });

    const metadata = response.metaData;
    const data = (response.rows || []).map(row => {
      const item = {};
      row.forEach((value, index) => {
        item[metadata[index].name] = value;
      });
      return item;
    });

    return { data };
  }

  async stream(sql, params = {}) {
    const bindVars = extractParams(params);

    const responseStream = await this.connection.queryStream(sql, bindVars, { autoCommit: true });

    let metadata;
    responseStream.on("metadata", responseMetadata => {
      metadata = responseMetadata;
    });

    const transform = new Transform({
      objectMode: true,
      transform(row, encoding, callback) {
        const item = {};
        row.forEach((value, index) => {
          item[metadata[index].name] = value;
        });
        callback(null, item);
      }
    });

    responseStream.on("error", err => {
      transform.emit("error", err);
    });

    return responseStream.pipe(transform);
  }
}

function extractParams(params) {
  const bindVars = {};
  Object.entries(params).forEach(([key, value]) => {
    let type = oracledb.STRING;
    if (typeof value === "number") {
      type = oracledb.NUMBER;
    }
    bindVars[key] = { dir: oracledb.BIND_IN, val: value, type: type };
  });
  return bindVars;
}

module.exports = Database;
