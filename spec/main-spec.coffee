t = require('./_sequelize')
$ = require('../lib')

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

      Blog = {
        $schema:
          id: 'Blog'
          properties:
            id: $ref: 'dataTypes#/definitions/primaryKey'
            name: type: 'string'
          required: ['id', 'name']
      }

      @m = $(t.sequelize(), [Blog], refs)
      @m.sync().then -> done()

    it 'should export all given models', ->
      expect(@m.Blog).not.toBeUndefined()

    it 'should support basic operations', (done) ->
      @m.Blog.create({ name: 'OSOM' })
        .then((b) -> expect(b.get('name')).toEqual('OSOM'))
        .then -> done()

  describe 'relations / associations', ->
    describe 'e.g. blog has many posts', ->
      beforeEach (done) ->
        t.setup 'sqlite', ':memory:'

        schemas = [
          { $schema:
            id: 'Blog'
            properties:
              id: $ref: 'dataTypes#/definitions/primaryKey'
              name: type: 'string'
              myPosts: items: $ref: 'Post'
              featuredPost: $ref: 'Post'
            required: ['id', 'name'] }
          { $schema:
            id: 'Post'
            properties:
              id: $ref: 'dataTypes#/definitions/primaryKey'
              body: type: 'string'
              title: type: 'string'
              published: type: 'boolean'
            required: ['id', 'body', 'title', 'published'] }
        ]

        @m = $(t.sequelize(), schemas, refs)
        @m.sync().then -> done()

      it 'should associate <prop>.items.$ref as hasMany', (done) ->
        @m.Blog
          .create({
            myPosts: [
              { title: 'Hello World', body: 'JSON-Schema rocks!' }
            ]
          }, { include: [@m.Blog.refs.myPosts] })
          .then (firstBlog) ->
            expect(firstBlog.myPosts[0].get('title')).toEqual 'Hello World'
          .then -> done()

      it 'should associate <prop>.$ref as hasOne', (done) ->
        @m.Blog
          .create({
            featuredPost: { title: 'OSOM' }
          }, { include: [@m.Blog.refs.featuredPost] })
          .then (firstBlog) ->
            expect(firstBlog.featuredPost.get('title')).toEqual 'OSOM'
          .then -> done()

