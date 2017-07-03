diff = require('../lib/diff')

$refs =
  TEST:
    tableName: 'OTHER'

describe 'diff-builder', ->
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
