JSONSchemaSequelizer = require('..')
jss = null

module.exports.setup = (options, refs, cwd) ->
  config =
    username: if process.env.CI then 'postgres' else process.env.LOGNAME
    database: if process.env.CI then 'travis_ci_test' else 'test'
    dialect: options.dialect
    storage: options.storage
    logging: options.logging or false
    define: options.define or {
      timestamps: false
      freezeTableName: true
    }

  jss = new JSONSchemaSequelizer config, refs, cwd
