import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const AUX4_PARAMS = ['host', 'port', 'database', 'user', 'password', 'action', 'sql', 'inputStream', 'tx', 'ignore', 'aux4HomeDir', 'configDir', 'packageDir', 'query', 'file'];

function validateArgs() {
  const args = process.argv.slice(2);
  if (args.length < 5) {
    console.error("Usage: aux4-db-oracle <host> <port> <database> <user> <password>");
    process.exit(1);
  }
  return {
    user: args[3],
    password: args[4],
    connectString: `${args[0]}:${parseInt(args[1])}/${args[2]}`
  };
}

function createErrorOutput(item, query, error) {
  return {
    item: item || null,
    query: query || 'unknown',
    error: normalizeError(error)
  };
}

// oracledb 7 appends a "Help: https://docs.oracle.com/error-help/..." line to
// error messages. Strip it so the driver emits a clean, version-stable message.
function normalizeError(error) {
  if (typeof error !== 'string') {
    return error;
  }
  return error.replace(/\r?\nHelp:\s*https?:\/\/\S+\s*$/, '');
}

function filterAux4Params(params) {
  const filtered = { ...params };
  AUX4_PARAMS.forEach(param => delete filtered[param]);
  return filtered;
}

function outputError(errorOutput, isArray = true) {
  const output = isArray ? [errorOutput] : errorOutput;
  console.error(JSON.stringify(output));
}

function exitOnError(shouldIgnore) {
  if (!shouldIgnore) {
    process.exit(1);
  }
}

function parseInput(trimmedInput) {
  try {
    const parsed = JSON.parse(trimmedInput);
    validateRequest(parsed);
    return { type: 'single', data: parsed };
  } catch (singleJsonError) {
    const lines = trimmedInput.split("\n").filter(line => line.trim());
    if (lines.length > 1) {
      try {
        const items = lines.map(line => {
          const parsed = JSON.parse(line.trim());
          validateRequest(parsed);
          return parsed;
        });
        return { type: 'ndjson', data: items };
      } catch (ndjsonError) {
        throw singleJsonError;
      }
    }
    throw singleJsonError;
  }
}

function validateRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('Request must be an object');
  }
  if (!request.action) {
    throw new Error('Request must have an action property');
  }
  if (!request.sql) {
    throw new Error('Request must have an sql property');
  }
}

function readStdinData() {
  return new Promise((resolve, reject) => {
    let inputData = "";
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", chunk => {
      inputData += chunk;
    });

    process.stdin.on("end", () => resolve(inputData));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const connectionConfig = validateArgs();

  try {
    const inputData = await readStdinData();
    const trimmedInput = inputData.trim();

    if (!trimmedInput) {
      process.exit(4);
    }

    const parsedInput = parseInput(trimmedInput);

    if (parsedInput.type === 'single') {
      await processRequest(connectionConfig, parsedInput.data);
    } else {
      for (const item of parsedInput.data) {
        if (item.action && item.sql) {
          try {
            await processRequest(connectionConfig, item);
          } catch (error) {
            const errorOutput = createErrorOutput(item, item.sql, error.message);
            outputError(errorOutput, false);
          }
        }
      }
    }
  } catch (error) {
    const errorOutput = createErrorOutput(
      inputData ? inputData.trim() : null,
      'unknown',
      `Error parsing JSON input: ${error.message}`
    );
    outputError(errorOutput, false);
    process.exit(1);
  }
}

main();

async function processRequest(connectionConfig, request) {
  let connection;

  try {
    connection = await oracledb.getConnection(connectionConfig);
  } catch (error) {
    const errorOutput = createErrorOutput(request, request?.sql, error.message);
    outputError(errorOutput, false);
    process.exit(1);
  }

  try {
    switch (request.action) {
      case "execute":
        await executeQuery(connection, request);
        break;
      case "executeBatch":
        await executeBatch(connection, request);
        break;
      case "stream":
        await streamQuery(connection, request);
        break;
      case "streamBatch":
        await streamBatch(connection, request);
        break;
      default:
        const errorOutput = createErrorOutput(request, request?.sql, `Unknown action: ${request.action}`);
        outputError(errorOutput, false);
        process.exit(1);
    }
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

function convertParameterSyntax(sql) {
  // Oracle natively uses :paramName syntax, no conversion needed
  return sql;
}

function mapParametersToObject(sql, params) {
  const paramObj = {};
  const seen = {};

  sql.replace(/:(\w+)/g, (match, paramName) => {
    if (!seen[paramName]) {
      seen[paramName] = true;
      paramObj[paramName] = params[paramName] !== undefined ? params[paramName] : null;
    }
    return match;
  });

  return paramObj;
}

async function executeQuery(connection, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  const params = request.params || {};
  const paramObj = mapParametersToObject(request.sql, params);
  const sqlParams = filterAux4Params(params);

  try {
    const result = await connection.execute(convertedSql, paramObj, { autoCommit: true });
    const rows = result.rows || [];
    console.log(JSON.stringify(rows));
  } catch (error) {
    const errorOutput = createErrorOutput(sqlParams, request.sql, error.message);
    outputError(errorOutput);
    exitOnError(request.ignore);
  }
}

async function executeBatch(connection, request) {
  if (request.tx) {
    await executeBatchWithTransaction(connection, request);
  } else {
    await executeBatchWithoutTransaction(connection, request);
  }
}

async function processItemInBatch(connection, convertedSql, originalSql, item, request, errors, autoCommit) {
  try {
    const paramObj = mapParametersToObject(originalSql, item);
    const result = await connection.execute(convertedSql, paramObj, { autoCommit: autoCommit });
    const rows = result.rows || [];
    return { success: true, rows: rows };
  } catch (error) {
    const cleanItem = filterAux4Params(item);
    const errorOutput = createErrorOutput(cleanItem, request.sql, error.message);
    errors.push(errorOutput);
    return { success: false, error };
  }
}

function outputBatchResults(results, hasAnyResults, itemCount) {
  if (!hasAnyResults) {
    console.log(JSON.stringify({ success: true, count: itemCount }));
  } else {
    console.log(JSON.stringify(results));
  }
}

function handleBatchErrors(errors, request, fallbackError = null) {
  if (errors.length > 0) {
    console.error(JSON.stringify(errors));
  } else if (fallbackError) {
    const errorOutput = createErrorOutput(null, request.sql, fallbackError.message);
    outputError(errorOutput);
  }
  exitOnError(request.ignore);
}

async function executeBatchWithTransaction(connection, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  const errors = [];

  try {
    const results = [];
    let hasAnyResults = false;

    for (const item of request.items) {
      const result = await processItemInBatch(connection, convertedSql, request.sql, item, request, errors, false);
      if (result.success) {
        results.push(...result.rows);
        if (result.rows.length > 0) {
          hasAnyResults = true;
        }
      } else {
        await connection.rollback();
        throw result.error;
      }
    }

    await connection.commit();
    outputBatchResults(results, hasAnyResults, request.items.length);
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      // Ignore rollback errors
    }
    handleBatchErrors(errors, request, error);
  }
}

async function executeBatchWithoutTransaction(connection, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  const results = [];
  const errors = [];
  let hasAnyResults = false;

  for (const item of request.items) {
    const result = await processItemInBatch(connection, convertedSql, request.sql, item, request, errors, true);
    if (result.success) {
      if (request.ignore && result.rows.length > 0) {
        // When ignoring errors, output successful results immediately
        console.log(JSON.stringify(result.rows));
        hasAnyResults = true;
      } else {
        results.push(...result.rows);
        if (result.rows.length > 0) {
          hasAnyResults = true;
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(JSON.stringify(errors));
    exitOnError(request.ignore);
  }

  // Output collected results when not using ignore mode OR when using ignore mode but no errors occurred
  if (!request.ignore || (request.ignore && errors.length === 0)) {
    if (!hasAnyResults && errors.length === 0) {
      outputBatchResults([], false, request.items.length);
    } else if (hasAnyResults) {
      outputBatchResults(results, true, request.items.length);
    }
  }
}

function streamRows(rows) {
  rows.forEach(row => {
    console.log(JSON.stringify(row));
  });
}

async function streamQuery(connection, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  const params = request.params || {};
  const paramObj = mapParametersToObject(request.sql, params);
  const sqlParams = filterAux4Params(params);

  try {
    const result = await connection.execute(convertedSql, paramObj, { autoCommit: true });
    const rows = result.rows || [];
    streamRows(rows);
  } catch (error) {
    const errorOutput = createErrorOutput(sqlParams, request.sql, error.message);
    outputError(errorOutput, false);
    exitOnError(request.ignore);
  }
}

async function processStreamItem(connection, convertedSql, originalSql, item, request, autoCommit) {
  try {
    const paramObj = mapParametersToObject(originalSql, item);
    const result = await connection.execute(convertedSql, paramObj, { autoCommit: autoCommit });
    const rows = result.rows || [];
    streamRows(rows);
    return { success: true };
  } catch (error) {
    const cleanItem = filterAux4Params(item);
    const errorOutput = createErrorOutput(cleanItem, request.sql, error.message);
    outputError(errorOutput, false);
    return { success: false, error };
  }
}

async function streamBatch(connection, request) {
  const convertedSql = convertParameterSyntax(request.sql);

  try {
    if (request.tx) {
      for (const item of request.items) {
        const result = await processStreamItem(connection, convertedSql, request.sql, item, request, false);
        if (!result.success && !request.ignore) {
          await connection.rollback();
          throw result.error;
        }
      }

      await connection.commit();
    } else {
      for (const item of request.items) {
        await processStreamItem(connection, convertedSql, request.sql, item, request, true);
      }
    }
  } catch (error) {
    try {
      if (request.tx) {
        await connection.rollback();
      }
    } catch (rollbackError) {
      // Ignore rollback errors
    }
    const errorOutput = createErrorOutput(null, request.sql, error.message);
    outputError(errorOutput, false);
    exitOnError(request.ignore);
  }
}
