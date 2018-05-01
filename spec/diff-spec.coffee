t = require('./_sequelize')
util = require('../lib/util')
diff = require('../lib/diff')

$refs =
  TEST:
    tableName: 'OTHER'

jss = null

describe 'diff-builder', ->
  describe 'generated code', ->
    beforeEach ->
      # no-schema
      @a = {}

      # initial-schema
      @b = {
        id: 'Test' # createTable()
        type: 'object'
        properties:
          id:
            type: 'integer'
            primaryKey: true
          access:
            type: 'integer'
            autoIncrement: true
        required: ['id', 'access']
        indexes: [{ # addIndex()
          fields: ['access']
        }]
      }

      # patched-schema
      @c = {
        id: 'Test'
        type: 'object'
        properties:
          id:
            type: 'integer'
            primaryKey: true
            autoIncrement: true # changeColumn()
          access:
            type: 'string' # changeColumn()
            enum: ['guest', 'user', 'admin']
        required: ['id', 'access']
        indexes: [{
          # removeIndex()
          # addIndex()
          name: 'foo'
          fields: ['access']
        }]
      }

      # enhanced-schema
      @d = {
        id: 'Example' # renameTable()
        type: 'object'
        properties:
          id:
            type: 'integer'
            primaryKey: true
            autoIncrement: true
          # removeColumn()
          role: # addColumn()
            type: 'string'
            enum: ['guest', 'user', 'editor', 'admin']
          externalId: # addColumn()
            type: 'integer'
        required: ['role', 'externalId'] # change
        options: # set
          baz: 'buzz'
        indexes: [{ # updateIndex() ?
          name: 'foo'
          fields: ['role', 'externalId']
        }]
      }

      # additional-schema
      @e = {
        id: 'Example'
        type: 'object'
        properties:
          id:
            type: 'integer'
            primaryKey: true
            autoIncrement: true
          roleType: # renameColumn()
            type: 'string'
            enum: ['guest', 'user', 'editor', 'admin']
          externalId: # changeColumn()
            type: 'string'
        required: ['roleType', 'externalId']
        # removeIndex()
      }

      @f = {}

    it 'can create/destroy tables', ->
      A = diff.build('TEST', $refs, @a, @b, diff.map(@a, @b))

      expect(A).toContain "createTable('OTHER',"
      expect(A).toContain 'autoIncrement: true'
      expect(A).toContain 'primaryKey: true'
      expect(A).toContain 'dataTypes.INTEGER'
      expect(A).toContain "dropTable('OTHER')"
      expect(A).toContain 'addIndex'
      expect(A).toContain 'removeIndex'

    it 'can alter columns', ->
      B = diff.build('TEST', $refs, @b, @c, diff.map(@b, @c))

      expect(B).toContain 'changeColumn'
      expect(B).toContain 'autoIncrement'
      expect(B).toContain 'ENUM'

    it 'can add/rename/destroy', ->
      C = diff.build('TEST', $refs, @c, @d, diff.map(@c, @d))

      expect(C).toContain 'renameTable'
      expect(C).toContain 'removeColumn'
      expect(C).toContain 'addColumn'
      expect(C).toContain 'role'
      expect(C).toContain 'ENUM'
      expect(C).toContain 'editor'
      expect(C).toContain 'externalId'
      expect(C).toContain 'removeColumn'
      expect(C).toContain 'renameTable'
      expect(C).toContain 'addColumn'

    it 'will alter columns', ->
      D = diff.build('TEST', $refs, @d, @e, diff.map(@d, @e))

      expect(D).toContain 'renameColumn'
      expect(D).toContain 'renameColumn'
      expect(D).toContain 'changeColumn'
      expect(D).toContain 'externalId'
      expect(D).toContain 'STRING'

    it 'will revert things', ->
      E = diff.build('TEST', $refs, @e, @f, diff.map(@e, @f))

      expect(E).toContain "dropTable('Example')"
      expect(E).toContain "createTable('Example',"

  describe 'supported options', ->
    beforeEach (done) ->
      jss = t.setup
        dialect: 'sqlite'
        storage: ':memory:'
        define:
          timestamps: true
          underscored: true

      jss.add
        $schema:
          id: 'Example'
          properties: id:
            type: 'integer'
            primaryKey: true

      jss.add
        $schema:
          id: 'ExampleTwo'
          properties: id:
            type: 'integer'
            primaryKey: true
          options:
            freezeTableName: true

      jss.add
        $schema:
          id: 'ExampleThree'
          properties:
            id:
              type: 'integer'
              primaryKey: true
            justOne:
              $ref: 'Example'
              belongsTo: true
            manyOfThem:
              items:
                $ref: 'ExampleTwo'
                belongsToMany: through: 'AnyModel'

      jss.connect()
        .then -> jss.sync()
        .then -> done()
        .catch (e) ->
          console.log 'E_DIFF', e.stack
          done()

    it 'supports timestamps + underscored', ->
      expect(jss.models.Example.options.timestamps).toBe true
      expect(jss.models.Example.options.underscored).toBe true
      expect(jss.models.Example.options.freezeTableName).toBe false

      Example = jss.models.Example.options.$schema
      exampleProps = ['id', 'created_at', 'updated_at']
      exampleMigration = diff.build('Example', jss.models, {}, Example, diff.map({}, Example))

      expect(Object.keys(jss.models.Example.attributes)).toEqual exampleProps
      expect(exampleMigration).toContain "createTable('Examples'"
      expect(exampleMigration).toContain "dropTable('Examples'"
      expect(exampleMigration).toContain "created_at:"
      expect(exampleMigration).toContain "updated_at:"

    it 'supports freezeTableName + underscored', ->
      expect(jss.models.ExampleTwo.options.timestamps).toBe true
      expect(jss.models.ExampleTwo.options.underscored).toBe true
      expect(jss.models.ExampleTwo.options.freezeTableName).toBe true

      Example2 = jss.models.ExampleTwo.options.$schema
      example2Props = ['id', 'created_at', 'updated_at']
      example2Migration = diff.build('ExampleTwo', jss.models, {}, Example2, diff.map({}, Example2))

      expect(Object.keys(jss.models.ExampleTwo.attributes)).toEqual example2Props
      expect(example2Migration).toContain "createTable('example_two'"
      expect(example2Migration).toContain "dropTable('example_two'"

    it 'support for foreign keys + references', (done) ->
      expect(jss.models.ExampleThree.attributes.just_one_id.references).toEqual { model: 'Examples', key: 'id' }
      expect(jss.models.ExampleThree.attributes.just_one_id.onDelete).toEqual 'SET NULL'
      expect(jss.models.ExampleThree.attributes.just_one_id.onUpdate).toEqual 'CASCADE'

      expect(jss.models.AnyModel.attributes.example_two_id.references).toEqual { model: 'example_two', key: 'id' }
      expect(jss.models.AnyModel.attributes.example_two_id.onDelete).toEqual 'CASCADE'
      expect(jss.models.AnyModel.attributes.example_two_id.onUpdate).toEqual 'CASCADE'

      expect(jss.models.AnyModel.attributes.example_three_id.references).toEqual { model: 'ExampleThrees', key: 'id' }
      expect(jss.models.AnyModel.attributes.example_three_id.onDelete).toEqual 'CASCADE'
      expect(jss.models.AnyModel.attributes.example_three_id.onUpdate).toEqual 'CASCADE'

      Example3 = util.fixRefs(jss.models.ExampleThree.options.$schema, true)
      example3Migration = diff.build('ExampleThree', jss.models, {}, Example3, diff.map({}, Example3))

      AnyModel = util.fixRefs(jss.models.AnyModel.options.$schema, true)
      anyModelMigration = diff.build('AnyModel', jss.models, {}, AnyModel, diff.map({}, AnyModel))

      integerType = (PK) ->
        type: 'INTEGER'
        allowNull: !PK
        primaryKey: !!PK
        defaultValue: undefined

      expect(example3Migration).toContain "createTable('ExampleThrees'"
      expect(example3Migration).toContain "dropTable('ExampleThrees'"
      expect(example3Migration).toContain '''
      // manyOfThem <ExampleTwo>
              just_one_id: {
                type: dataTypes.INTEGER,
                references: {
                  model: 'Examples',
                  key: 'id',
                },
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE',
              },
      '''

      expect(anyModelMigration).toContain '''
      example_three_id: {
                type: dataTypes.INTEGER,
                references: {
                  model: 'ExampleThrees',
                  key: 'id',
                },
                primaryKey: true,
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
              },
      '''

      expect(anyModelMigration).toContain '''
      example_two_id: {
                type: dataTypes.INTEGER,
                references: {
                  model: 'example_two',
                  key: 'id',
                },
                primaryKey: true,
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
              },
      '''

      Promise.resolve()
        .then ->
            jss.models.ExampleThree.describe().then (result) ->
              expect(result.just_one_id).toEqual integerType()
        .then ->
            jss.models.AnyModel.describe().then (result) ->
              expect(result.example_two_id).toEqual integerType(true)
              expect(result.example_three_id).toEqual integerType(true)
        .catch (e) ->
          console.log 'E_XMPL', e
          done()
        .then done

