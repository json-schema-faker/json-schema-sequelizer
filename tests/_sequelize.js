const path = require('path');
const JSONSchemaSequelizer = require('..');

module.exports.setup = (options, refs, cwd) => {
  const config = {
    username: process.env.CI ? 'postgres' : process.env.LOGNAME,
    password: process.env.CI ? 'postgres' : undefined,
    database: process.env.CI ? 'ci_db_test' : 'test',
    host: process.env.CI ? process.env.POSTGRES_HOST : '0.0.0.0',
    port: process.env.CI ? process.env.POSTGRES_PORT : 5432,
    migrations: options.migrations,
    directory: options.directory,
    dialect: options.dialect,
    storage: options.storage,
    logging: options.logging || undefined,
    define: options.define || {
      timestamps: false,
      freezeTableName: true,
    },
  };
  return new JSONSchemaSequelizer(config, refs, cwd);
};

module.exports.dir = function dir(subdir) {
  return path.join(__dirname, 'fixtures', subdir);
};

module.exports.refs = [
  {
    id: 'dataTypes',
    definitions: {
      primaryKey: {
        allOf: [
          {
            type: 'integer',
          }, {
            minimum: 1,
          }, {
            primaryKey: true,
          }, {
            autoIncrement: true,
          },
        ],
      },
    },
  },
];
