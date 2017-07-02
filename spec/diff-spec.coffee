diff = require('../lib/diff')

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
    }

    @f = {}

  it 'can create/destroy tables', ->
    A = diff.build(@a, @b, diff.map(@a, @b))

    expect(A.up).toContain "createTable('Test',"
    expect(A.up).toContain 'autoIncrement: true'
    expect(A.up).toContain 'primaryKey: true'
    expect(A.up).toContain 'dataTypes.INTEGER'

    expect(A.down).toContain "dropTable('Test')"

  it 'can alter columns', ->
    B = diff.build(@b, @c, diff.map(@b, @c))

    expect(B.change).toContain 'changeColumn'
    expect(B.change).toContain 'autoIncrement'
    expect(B.change).toContain 'ENUM'

  it 'can add/rename/destroy', ->
    C = diff.build(@c, @d, diff.map(@c, @d))

    expect(C.up).toContain 'renameTable'
    expect(C.up).toContain 'removeColumn'
    expect(C.up).toContain 'addColumn'
    expect(C.up).toContain 'role'
    expect(C.up).toContain 'ENUM'
    expect(C.up).toContain 'editor'
    expect(C.up).toContain 'externalId'
    expect(C.down).toContain 'removeColumn'
    expect(C.down).toContain 'renameTable'
    expect(C.down).toContain 'addColumn'

  it 'will alter columns', ->
    D = diff.build(@d, @e, diff.map(@d, @e))

    expect(D.up).toContain 'renameColumn'
    expect(D.down).toContain 'renameColumn'
    expect(D.change).toContain 'changeColumn'
    expect(D.change).toContain 'externalId'
    expect(D.change).toContain 'STRING'

  it 'will revert things', ->
    E = diff.build(@e, @f, diff.map(@e, @f))

    expect(E.up).toContain "dropTable('Example')"
    expect(E.down).toContain "createTable('Example',"
