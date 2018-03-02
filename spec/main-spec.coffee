t = require('./_sequelize')

path = require('path')

dir = (subdir) ->
  path.join __dirname, 'fixtures', subdir

refs = [
  {
    id: 'dataTypes'
    definitions:
      primaryKey:
        allOf: [
          { type: 'integer' }
          { minimum: 1 }
          { primaryKey: true }
          { autoIncrement: true }
        ]
  }
]

describe 'JSONSchemaSequelizer()', ->
  describe 'basic definitions', ->
    beforeEach (done) ->
      @jss = t.setup
        dialect: 'sqlite'
        storage: ':memory:'
      , refs, dir('basic')

      @jss.scan()
        .sync()
        .then -> done()
        .catch (e) ->
          console.log 'E_MAIN', e
          done()

    it 'supports the v4 API', ->
      x = new @jss.models.Prototype()
      expect(x.chain()).toBe x
      expect(@jss.models.Prototype.truth()).toEqual 42
      expect(typeof (new @jss.models.Example(name: 'foo')).destroy).toEqual 'function'
      expect(typeof (new @jss.models.Example(name: 'foo')).save().then).toEqual 'function'

    it 'should export all given models', ->
      expect(@jss.models.Example).not.toBeUndefined()
      expect(Object.keys(@jss.models).sort()).toEqual ['Example', 'Prototype']

    it 'should support basic operations', (done) ->
      @jss.models.Example.create({ name: 'OSOM' })
        .then (b) ->
          expect(b.get('name')).toEqual('OSOM')
          expect(b.now instanceof Date).toBe true
        .then -> done()

  describe 'virtual types', ->
    beforeEach (done) ->
      @jss = t.setup
        dialect: 'sqlite'
        storage: ':memory:'
      , refs, dir('virtual-types')

      @jss.scan()
        .sync()
        .then -> done()

    it 'it should accept virtual types', (done) ->
      @jss.models.Basic.create({ foo: 'bar', baz: 'buzz' }).then (result) ->
        expect(result.foo).toEqual 'bar'
        expect(result.baz).toBeUndefined()
        done()

  describe 'relations / associations', ->
    beforeEach (done) ->
      @jss = t.setup
        dialect: 'sqlite'
        storage: ':memory:'
        logging: console.log
      , refs, dir('relations')

      @jss.scan()
        .sync()
        .then -> done()

    afterEach ->
      @jss.close()

    it 'should create intermediate schemas with belongsToMany', ->
      { CartId, ProductId } = @jss.models.CartItem.options.$schema.properties

      expect(CartId.references).toEqual { model: 'Carts', key: 'id' }
      expect(ProductId.references).toEqual { model: 'Products', key: 'id' }

    it 'should associate <prop>.items.$ref as hasMany', (done) ->
      @jss.models.Blog
        .create({
          name: 'Test'
          myPosts: [
            { title: 'Hello World', body: 'JSON-Schema rocks!' }
          ]
        }, { include: [@jss.models.Blog.associations.myPosts] })
        .then (firstBlog) ->
          expect(firstBlog.myPosts[0].get('title')).toEqual 'Hello World'
          done()

    it 'should associate <prop>.$ref as hasOne', (done) ->
      @jss.models.Blog
        .create({
          name: 'Test'
          featuredPost: { title: 'OSOM', body: 'OK' }
        }, { include: [@jss.models.Blog.associations.featuredPost] })
        .then (firstBlog) ->
          expect(firstBlog.featuredPost.get('title')).toEqual 'OSOM'
          done()

    it 'should support other keywords too', (done) ->
      @jss.models.Person
        .create({
          name: 'Gran Ma'
          children: [
            { name: 'Ma' }
            { name: 'Uncle' }
          ]
        }, { include: [@jss.models.Person.associations.children] })
        .then (familyTree) ->
          expect(familyTree.get('name')).toEqual 'Gran Ma'
          expect(familyTree.children[1].get('name')).toEqual 'Uncle'
          done()
        .catch (e) ->
          console.log e
          done()
