diff = require('../lib/diff')

describe 'diff-builder', ->
  it 'can up/down/change simple schemas', ->
    # no-schema
    a = {}

    # initial-schema
    b = {
      id: 'Test' # createTable()
      type: 'object'
      properties:
        id:
          type: 'integer'
          primaryKey: true
        role:
          type: 'integer'
          autoIncrement: true
      required: ['id', 'role']
    }

    # patched-schema
    c = {
      id: 'Test'
      type: 'object'
      properties:
        id:
          type: 'integer'
          primaryKey: true
          autoIncrement: true # changeColumn()
        role:
          type: 'string' # changeColumn()
          enum: ['guest', 'user', 'admin']
      required: ['id', 'role']
    }

    # enhanced-schema
    d = {
      id: 'Example' # renameTable()
      type: 'object'
      properties:
        id:
          type: 'integer'
          primaryKey: true
          autoIncrement: true
        # removeColumn()
        roleType: # addColumn()
          type: 'string'
          enum: ['guest', 'user', 'editor', 'admin']
        externalId: # addColumn()
          type: 'integer'
      required: ['role', 'externalId'] # change
      options: # set
        baz: 'buzz'
    }

    # additional-schema
    e = {
      id: 'Example'
      type: 'object'
      properties:
        id:
          type: 'integer'
          primaryKey: true
          autoIncrement: true
        roleType:
          type: 'string'
          enum: ['guest', 'user', 'admin', 'editor']
        externalId: # changeColumn()
          type: 'string'
      required: ['role', 'externalId']
    }

    f = {}

    A = diff.build(a, b, diff.map(a, b))

    expect(A.up).toContain 'createTable'
    expect(A.down).toContain 'dropTable'

    B = diff.build(b, c, diff.map(b, c))

    expect(B.change).toContain 'changeColumn'
    expect(B.change).toContain 'autoIncrement'
    expect(B.change).toContain 'ENUM'

    C = diff.build(c, d, diff.map(c, d))

    expect(C.up).toContain 'renameTable'
    expect(C.up).toContain 'removeColumn'
    expect(C.up).toContain 'addColumn'
    expect(C.up).toContain 'roleType'
    expect(C.up).toContain 'externalId'
    expect(C.down).toContain 'removeColumn'
    expect(C.down).toContain 'renameTable'
    expect(C.down).toContain 'addColumn'

    D = diff.build(d, e, diff.map(d, e))

    expect(D.change).toContain 'changeColumn'
    expect(D.change).toContain 'externalId'
    expect(D.change).toContain 'STRING'

    E = diff.build(e, f, diff.map(e, f))

    expect(E.up).toContain 'dropTable'
    expect(E.down).toContain 'createTable'
