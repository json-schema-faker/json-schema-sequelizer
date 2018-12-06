const { expect } = require('chai');
const t = require('./_sequelize');
const util = require('../lib/util');
const diff = require('../lib/diff');

const $refs = {
  TEST: {
    tableName: 'OTHER',
  },
};

let jss = null;
let a;
let b;
let c;
let d;
let e;
let f;

/* global beforeEach, describe, it */

describe('diff-builder', () => {
  describe('generated code', () => {
    beforeEach(() => {
      a = {};
      b = {
        id: 'Test',
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            primaryKey: true,
          },
          access: {
            type: 'integer',
            autoIncrement: true,
          },
        },
        required: ['id', 'access'],
        indexes: [
          {
            fields: ['access'],
          },
        ],
      };
      c = {
        id: 'Test',
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            primaryKey: true,
            autoIncrement: true,
          },
          access: {
            type: 'string',
            enum: ['guest', 'user', 'admin'],
          },
        },
        required: ['id', 'access'],
        indexes: [
          {
            name: 'foo',
            fields: ['access'],
          },
        ],
      };
      d = {
        id: 'Example',
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            primaryKey: true,
            autoIncrement: true,
          },
          role: {
            type: 'string',
            enum: ['guest', 'user', 'editor', 'admin'],
          },
          externalId: {
            type: 'integer',
          },
        },
        required: ['role', 'externalId'],
        options: {
          baz: 'buzz',
        },
        indexes: [
          {
            name: 'foo',
            fields: ['role', 'externalId'],
          },
        ],
      };
      e = {
        id: 'Example',
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            primaryKey: true,
            autoIncrement: true,
          },
          roleType: {
            type: 'string',
            enum: ['guest', 'user', 'editor', 'admin'],
          },
          externalId: {
            type: 'string',
          },
        },
        required: ['roleType', 'externalId'],
      };
      f = {};
    });

    it('can create/destroy tables', () => {
      const A = diff.build('TEST', $refs, a, b, diff.map(a, b));

      expect(A).to.contain("createTable('OTHER',");
      expect(A).to.contain('autoIncrement: true');
      expect(A).to.contain('primaryKey: true');
      expect(A).to.contain('dataTypes.INTEGER');
      expect(A).to.contain("dropTable('OTHER')");
      expect(A).to.contain('addIndex');
      expect(A).to.contain('removeIndex');
    });

    it('can alter columns', () => {
      const B = diff.build('TEST', $refs, b, c, diff.map(b, c));

      expect(B).to.contain('changeColumn');
      expect(B).to.contain('autoIncrement');
      expect(B).to.contain('ENUM');
    });

    it('can add/rename/destroy', () => {
      const C = diff.build('TEST', $refs, c, d, diff.map(c, d));

      expect(C).to.contain('renameTable');
      expect(C).to.contain('removeColumn');
      expect(C).to.contain('addColumn');
      expect(C).to.contain('role');
      expect(C).to.contain('ENUM');
      expect(C).to.contain('editor');
      expect(C).to.contain('externalId');
      expect(C).to.contain('removeColumn');
      expect(C).to.contain('renameTable');
      expect(C).to.contain('addColumn');
    });

    it('will alter columns', () => {
      const D = diff.build('TEST', $refs, d, e, diff.map(d, e));

      expect(D).to.contain('renameColumn');
      expect(D).to.contain('renameColumn');
      expect(D).to.contain('changeColumn');
      expect(D).to.contain('externalId');
      expect(D).to.contain('STRING');
    });

    it('will revert things', () => {
      const E = diff.build('TEST', $refs, e, f, diff.map(e, f));

      expect(E).to.contain("dropTable('Example')");
      expect(E).to.contain("createTable('Example',");
    });
  });

  describe('supported options', () => {
    beforeEach(() => {
      jss = t.setup({
        dialect: 'sqlite',
        storage: ':memory:',
        define: {
          timestamps: true,
          underscored: true,
        },
      });
      jss.add({
        $schema: {
          id: 'Example',
          properties: {
            id: {
              type: 'integer',
              primaryKey: true,
            },
          },
        },
      });
      jss.add({
        $schema: {
          id: 'ExampleTwo',
          properties: {
            id: {
              type: 'integer',
              primaryKey: true,
            },
          },
          options: {
            freezeTableName: true,
          },
        },
      });
      jss.add({
        $schema: {
          id: 'ExampleThree',
          properties: {
            id: {
              type: 'integer',
              primaryKey: true,
            },
            justOne: {
              $ref: 'Example',
              belongsTo: true,
            },
            manyOfThem: {
              items: {
                $ref: 'ExampleTwo',
                belongsToMany: {
                  through: 'AnyModel',
                },
              },
            },
          },
        },
      });

      return jss.connect().then(() => jss.sync());
    });

    it('supports timestamps + underscored', () => {
      expect(jss.models.Example.options.timestamps).to.eql(true);
      expect(jss.models.Example.options.underscored).to.eql(true);
      expect(jss.models.Example.options.freezeTableName).to.eql(false);

      const Example = jss.models.Example.options.$schema;
      const exampleProps = ['id', 'created_at', 'updated_at'];
      const exampleMigration = diff.build('Example', jss.models, {}, Example, diff.map({}, Example));

      expect(Object.keys(jss.models.Example.attributes)).to.eql(exampleProps);
      expect(exampleMigration).to.contain("createTable('Examples'");
      expect(exampleMigration).to.contain("dropTable('Examples'");
      expect(exampleMigration).to.contain('created_at:');
      expect(exampleMigration).to.contain('updated_at:');
    });

    it('supports freezeTableName + underscored', () => {
      expect(jss.models.ExampleTwo.options.timestamps).to.eql(true);
      expect(jss.models.ExampleTwo.options.underscored).to.eql(true);
      expect(jss.models.ExampleTwo.options.freezeTableName).to.eql(true);

      const Example2 = jss.models.ExampleTwo.options.$schema;
      const example2Props = ['id', 'created_at', 'updated_at'];
      const example2Migration = diff.build('ExampleTwo', jss.models, {}, Example2, diff.map({}, Example2));

      expect(Object.keys(jss.models.ExampleTwo.attributes)).to.eql(example2Props);
      expect(example2Migration).to.contain("createTable('example_two'");
      expect(example2Migration).to.contain("dropTable('example_two'");
    });

    it('support for foreign keys + references', () => {
      expect(jss.models.ExampleThree.attributes.just_one_id.references).to.eql({
        model: 'Examples',
        key: 'id',
      });
      expect(jss.models.ExampleThree.attributes.just_one_id.onDelete).to.eql('SET NULL');
      expect(jss.models.ExampleThree.attributes.just_one_id.onUpdate).to.eql('CASCADE');
      expect(jss.models.AnyModel.attributes.example_two_id.references).to.eql({
        model: 'example_two',
        key: 'id',
      });
      expect(jss.models.AnyModel.attributes.example_two_id.onDelete).to.eql('CASCADE');
      expect(jss.models.AnyModel.attributes.example_two_id.onUpdate).to.eql('CASCADE');
      expect(jss.models.AnyModel.attributes.example_three_id.references).to.eql({
        model: 'ExampleThrees',
        key: 'id',
      });
      expect(jss.models.AnyModel.attributes.example_three_id.onDelete).to.eql('CASCADE');
      expect(jss.models.AnyModel.attributes.example_three_id.onUpdate).to.eql('CASCADE');

      const Example3 = util.fixRefs(jss.models.ExampleThree.options.$schema, true);
      const example3Migration = diff.build('ExampleThree', jss.models, {}, Example3, diff.map({}, Example3));
      const AnyModel = util.fixRefs(jss.models.AnyModel.options.$schema, true);
      const anyModelMigration = diff.build('AnyModel', jss.models, {}, AnyModel, diff.map({}, AnyModel));

      const integerType = PK => {
        return {
          type: 'INTEGER',
          allowNull: !PK,
          primaryKey: !!PK,
          defaultValue: undefined,
        };
      };

      expect(example3Migration).to.contain("createTable('ExampleThrees'");
      expect(example3Migration).to.contain("dropTable('ExampleThrees'");

      /* eslint-disable */
      expect(example3Migration).to.contain('// manyOfThem <ExampleTwo>\n        just_one_id: {\n          type: dataTypes.INTEGER,\n          references: {\n            model: \'Examples\',\n            key: \'id\',\n          },\n          onDelete: \'SET NULL\',\n          onUpdate: \'CASCADE\',\n        },');
      expect(anyModelMigration).to.contain('example_three_id: {\n          type: dataTypes.INTEGER,\n          references: {\n            model: \'ExampleThrees\',\n            key: \'id\',\n          },\n          primaryKey: true,\n          onDelete: \'CASCADE\',\n          onUpdate: \'CASCADE\',\n        },');
      expect(anyModelMigration).to.contain('example_two_id: {\n          type: dataTypes.INTEGER,\n          references: {\n            model: \'example_two\',\n            key: \'id\',\n          },\n          primaryKey: true,\n          onDelete: \'CASCADE\',\n          onUpdate: \'CASCADE\',\n        },');
      /* eslint-enable */

      return Promise.resolve().then(() => {
        return jss.models.ExampleThree.describe().then(result => {
          expect(result.just_one_id).to.eql(integerType());
        });
      }).then(() => {
        return jss.models.AnyModel.describe().then(result => {
          expect(result.example_two_id).to.eql(integerType(true));
          expect(result.example_three_id).to.eql(integerType(true));
        });
      });
    });
  });
});
