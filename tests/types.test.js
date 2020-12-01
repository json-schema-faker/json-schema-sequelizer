const { expect } = require('chai');
const t = require('./_sequelize');
const types = require('../lib/types');

/* global describe, it */

describe('Types support', () => {
  describe('cleanSchema()', () => {
    it('should remove non json-schema props', () => {
      const test = {
        properties: {
          another: {
            allOf: [
              {
                type: 'boolean',
                a: 'b',
              },
            ],
            x: 'y',
          },
        },
        items: {
          type: 'number',
          baz: 'buzz',
        },
        type: 'string',
        $ref: 'other',
        foo: 'bar',
      };

      expect(types.cleanSchema(test)).to.eql({
        $ref: 'other',
        type: 'string',
        items: {
          type: 'number',
        },
        properties: {
          another: {
            type: 'boolean',
          },
        },
      });
    });
  });

  describe('convertSchema()', () => {
    it('should transform json-schema into sequelize models', () => {
      const test = {
        $schema: {
          id: 'Test',
          properties: {
            str: {
              type: 'string',
            },
            num: {
              type: 'number',
            },
            bol: {
              type: 'boolean',
            },
            foo: {
              enum: ['bar', 'baz'],
            },
          },
          required: ['str', 'num', 'bol'],
        },
      };

      const jss = t.setup({
        dialect: 'sqlite',
        storage: ':memory:',
      });

      return jss.add(test).connect()
        .then(() => jss.models.Test.sync())
        .then(() => jss.models.Test.describe())
        .then(details => {
          expect(details).to.eql({
            id: {
              type: 'INTEGER',
              allowNull: true,
              defaultValue: undefined,
              primaryKey: true,
              unique: false,
            },
            str: {
              type: 'VARCHAR(255)',
              allowNull: false,
              defaultValue: undefined,
              primaryKey: false,
              unique: false,
            },
            num: {
              type: 'DECIMAL',
              allowNull: false,
              defaultValue: undefined,
              primaryKey: false,
              unique: false,
            },
            bol: {
              type: 'TINYINT(1)',
              allowNull: false,
              defaultValue: undefined,
              primaryKey: false,
              unique: false,
            },
            foo: {
              type: 'TEXT',
              allowNull: true,
              defaultValue: undefined,
              primaryKey: false,
              unique: false,
            },
          });

          jss.close();
        });
    });
  });

  describe('constraintSchema()', () => {
    it('should translate constraints from json-schema as validation rules', () => {
      const test = {
        type: 'string',
        minLength: 10,
        maxLength: 30,
      };

      expect(types.constraintSchema(test).validate).to.eql({
        len: [10, 30],
      });
    });
  });

  describe('Postgres', () => {
    it('should support ENUM types', () => {
      const test = {
        $schema: {
          id: 'Test',
          properties: {
            foo: {
              enum: ['bar', 'baz'],
            },
          },
          required: ['foo'],
        },
      };

      const jss = t.setup({
        dialect: 'postgres',
      });

      return jss.add(test).connect()
        .then(() => jss.models.Test.sync()).then(() => {
          return jss.models.Test.create({
            foo: 'bar',
          });
        })
        .then(x => {
          expect(x.foo).to.eql('bar');
          jss.close();
        })
        .catch(e => {
          console.log('E_TYPES', e);
        });
    });
  });
});
