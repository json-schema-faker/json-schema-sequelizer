const JSONSchemaSequelizer = require('..');

let jss = null;

module.exports.setup = (options, refs, cwd) => {
  const config = {
    username: process.env.CI ? 'postgres' : process.env.LOGNAME,
    database: process.env.CI ? 'travis_ci_test' : 'test',
    dialect: options.dialect,
    storage: options.storage,
    logging: options.logging || false,
    define: options.define || {
      timestamps: false,
      freezeTableName: true,
    },
  };

  jss = new JSONSchemaSequelizer(config, refs, cwd);

  return jss;
};
