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

      expect(callCount).to.eql(18);
      expect(calls.pop().args).to.eql(['\rNo pending migrations']);
      expect(calls.pop().args).to.eql(['\rNo executed migrations']);
    });

    it('can generate migrations from existing json-schema', async () => {
      await JSONSchemaSequelizerCLI.execute(db, 'migrate', { flags: { make: true } });
      const { calls } = td.explain(log);

      expect(calls.pop().args[0]).to.match(/write.*create_blog/);
      expect(calls.pop().args[0]).to.match(/write.*create_family/);
      expect(calls.pop().args[0]).to.match(/write.*create_person/);
      expect(calls.pop().args[0]).to.match(/write.*create_post/);
    });

    it('can apply pending migrations from generated sources', async () => {
      await JSONSchemaSequelizerCLI.execute(db, 'migrate', { flags: { make: true } });
      await JSONSchemaSequelizerCLI.execute(db, 'migrate', { flags: { up: true } });
      const { calls } = td.explain(log);

      expect(calls.pop().args).to.eql(['\r4 migrations were applied']);
      expect(calls.pop().args[0]).to.match(/migrated.*create_blog/);
      calls.length -= 5;

      expect(calls.pop().args[0]).to.match(/migrating.*create_blog/);
      expect(calls.pop().args[0]).to.match(/migrated.*create_family/);
      calls.length -= 5;

      expect(calls.pop().args[0]).to.match(/migrating.*create_family/);
      expect(calls.pop().args[0]).to.match(/migrated.*create_person/);
      calls.length -= 5;

      expect(calls.pop().args[0]).to.match(/migrating.*create_person/);
      expect(calls.pop().args[0]).to.match(/migrated.*create_post/);
      calls.length -= 5;

      expect(calls.pop().args[0]).to.match(/migrating.*create_post/);
    });
  });
});
