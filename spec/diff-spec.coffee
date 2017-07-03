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
    A = diff.build('TEST', @a, @b, diff.map(@a, @b))

    expect(A).toContain "createTable('TEST',"
    expect(A).toContain 'autoIncrement: true'
    expect(A).toContain 'primaryKey: true'
    expect(A).toContain 'dataTypes.INTEGER'
    expect(A).toContain "dropTable('TEST')"

  # it 'can alter columns', ->
  #   B = diff.build(@b, @c, diff.map(@b, @c))

  #   expect(B).toContain 'changeColumn'
  #   expect(B).toContain 'autoIncrement'
  #   expect(B).toContain 'ENUM'

  # it 'can add/rename/destroy', ->
  #   C = diff.build(@c, @d, diff.map(@c, @d))

  #   expect(C).toContain 'renameTable'
  #   expect(C).toContain 'removeColumn'
  #   expect(C).toContain 'addColumn'
  #   expect(C).toContain 'role'
  #   expect(C).toContain 'ENUM'
  #   expect(C).toContain 'editor'
  #   expect(C).toContain 'externalId'
  #   expect(C).toContain 'removeColumn'
  #   expect(C).toContain 'renameTable'
  #   expect(C).toContain 'addColumn'

  # it 'will alter columns', ->
  #   D = diff.build(@d, @e, diff.map(@d, @e))

  #   expect(D).toContain 'renameColumn'
  #   expect(D).toContain 'renameColumn'
  #   expect(D).toContain 'changeColumn'
  #   expect(D).toContain 'externalId'
  #   expect(D).toContain 'STRING'

  # it 'will revert things', ->
  #   E = diff.build(@e, @f, diff.map(@e, @f))

  #   expect(E).toContain "dropTable('Example')"
  #   expect(E).toContain "createTable('Example',"
