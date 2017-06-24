t = require('./_sequelize')
$ = require('../lib')

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

describe 'sequelizer()', ->
  describe 'basic definitions', ->
    beforeEach (done) ->
      t.setup 'sqlite', ':memory:'
      $(t.sequelize(), refs, dir('basic'))
        .then (@m) => @m.sync()
        .then -> done()

    it 'supports the v4 API', ->
      x = new @m.Prototype()
      expect(x.chain()).toBe x
      expect(@m.Prototype.truth()).toEqual 42
      expect(typeof (new @m.Example()).destroy).toEqual 'function'
      expect(typeof (new @m.Example()).save().then).toEqual 'function'

    it 'should export all given models', ->
      expect(@m.Example).not.toBeUndefined()
      expect(Object.keys(@m)).toEqual ['Example', 'Prototype']

    it 'should support basic operations', (done) ->
      @m.Example.create({ name: 'OSOM' })
        .then (b) ->
          expect(b.get('name')).toEqual('OSOM')
          #expect(b.now instanceof Date).toBe true
        .then -> done()

  describe 'relations / associations', ->
    beforeEach (done) ->
      t.setup 'sqlite', ':memory:'

      $(t.sequelize(), refs, dir('relations'))
        .then (@m) => @m.sync()
        .then -> done()

    it 'should associate <prop>.items.$ref as hasMany', (done) ->
      @m.Blog
        .create({
          myPosts: [
            { title: 'Hello World', body: 'JSON-Schema rocks!' }
          ]
        }, { include: [@m.Blog.refs.myPosts] })
        .then (firstBlog) ->
          expect(firstBlog.myPosts[0].get('title')).toEqual 'Hello World'
          done()

    it 'should associate <prop>.$ref as hasOne', (done) ->
      @m.Blog
        .create({
          featuredPost: { title: 'OSOM' }
        }, { include: [@m.Blog.refs.featuredPost] })
        .then (firstBlog) ->
          expect(firstBlog.featuredPost.get('title')).toEqual 'OSOM'
          done()

    it 'should support other keywords too', (done) ->
      @m.Person
        .create({
          name: 'Gran Ma'
          children: [
            { name: 'Ma' }
            { name: 'Uncle' }
          ]
        }, { include: [@m.Person.refs.children] })
        .then (familyTree) ->
          expect(familyTree.get('name')).toEqual 'Gran Ma'
          expect(familyTree.children[1].get('name')).toEqual 'Uncle'
          done()
