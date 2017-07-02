diff = require('../lib/diff')

describe 'migrations', ->
  it 'can build simple schemas', ->
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

    console.log '=== A ---> B'
    console.log '      ---> UP'
    console.log diff.build(a, b, diff.map(a, b)).up
    console.log '      ---> DOWN'
    console.log diff.build(a, b, diff.map(a, b)).down
    console.log()

    console.log '=== B ---> C'
    console.log '      ---> UP'
    console.log diff.build(b, c, diff.map(b, c)).up
    console.log '      ---> DOWN'
    console.log diff.build(b, c, diff.map(b, c)).down
    console.log()

    console.log '=== C ---> D'
    console.log '      ---> UP'
    console.log diff.build(c, d, diff.map(c, d)).up
    console.log '      ---> DOWN'
    console.log diff.build(c, d, diff.map(c, d)).down
    console.log()

    console.log '=== D ---> E'
    console.log '      ---> UP'
    console.log diff.build(d, e, diff.map(d, e)).up
    console.log '      ---> DOWN'
    console.log diff.build(d, e, diff.map(d, e)).down
    console.log()

    console.log '=== E ---> F'
    console.log '      ---> UP'
    console.log diff.build(e, f, diff.map(e, f)).up
    console.log '      ---> DOWN'
    console.log diff.build(e, f, diff.map(e, f)).down
    console.log()
