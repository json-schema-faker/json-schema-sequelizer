/* eslint-disable no-unused-expressions */

const { expect } = require('chai');
const td = require('testdouble');
const rm = require('rimraf');
const fs = require('fs');

const JSONSchemaSequelizerCLI = require('../cli');
const t = require('./_sequelize');

/* global beforeEach, describe, it */

describe('Umzug support', () => {
  it('provides a helper for printing CLI usage', () => {
    const help = JSONSchemaSequelizerCLI.usage('BIN');

    expect(help).to.contains('--only       Optional');
    expect(help).to.contains('BIN migrate --make');
  });

  let log;
  let db;
  describe('migrations', () => {
    beforeEach(() => {
      rm.sync(`${__dirname}/sandbox`);
      fs.mkdirSync(`${__dirname}/sandbox`);

      log = td.func('logger');
      db = t.setup({
        logging: log,
        dialect: 'sqlite',
        storage: ':memory:',
        seederStorage: 'sequelize',
        migrations: {
          database: true,
          directory: `${__dirname}/sandbox`,
        },
      }, t.refs, t.dir('relations/blog_site'));
      return db.scan().sync();
    });

    it('should check the current state of migrations', async () => {
      await JSONSchemaSequelizerCLI.execute(db, 'migrate');
      const { callCount, calls } = td.explain(log);

      expect(callCount).to.eql(22);
      expect(calls.pop().args).to.eql(['\rNo pending migrations']);
      expect(calls.pop().args).to.eql(['\rNo executed migrations']);
    });

    it('can generate migrations from existing json-schema', async () => {
      await JSONSchemaSequelizerCLI.execute(db, 'migrate', { flags: { make: true } });
      const { calls } = td.explain(log);

      const migration = calls.filter(x => x.args[0].includes('create_')).map(x => x.args[0].replace(/\d+\.\d+\./, ''));

      expect(migration).to.eql([
        '\rwrite tests/sandbox/migrations/0_create_person.js',
        '\rwrite tests/sandbox/migrations/1_create_post.js',
        '\rwrite tests/sandbox/migrations/2_create_blog.js',
        '\rwrite tests/sandbox/migrations/3_create_family.js',
      ]);
    });

    it('can apply pending migrations from generated sources', async () => {
      await JSONSchemaSequelizerCLI.execute(db, 'migrate', { flags: { make: true } });
      await JSONSchemaSequelizerCLI.execute(db, 'migrate', { flags: { up: true } });
      const { calls } = td.explain(log);

      expect(calls.pop().args).to.eql(['\r4 migrations were applied']);

      const migration = calls.filter(x => x.args[0].includes('create_')).map(x => x.args[0].replace(/\d+\.\d+\./, ''));

      expect(migration).to.eql([
        '\rwrite tests/sandbox/migrations/0_create_person.js',
        '\rwrite tests/sandbox/migrations/1_create_post.js',
        '\rwrite tests/sandbox/migrations/2_create_blog.js',
        '\rwrite tests/sandbox/migrations/3_create_family.js',
        '\r=> migrating 0_create_person.js',
        '\r=> migrated 0_create_person.js',
        '\r=> migrating 1_create_post.js',
        '\r=> migrated 1_create_post.js',
        '\r=> migrating 2_create_blog.js',
        '\r=> migrated 2_create_blog.js',
        '\r=> migrating 3_create_family.js',
        '\r=> migrated 3_create_family.js',
      ]);
    });
  });
});
