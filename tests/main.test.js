/* eslint-disable no-unused-expressions */

const { expect } = require('chai');
const path = require('path');
const t = require('./_sequelize');

function dir(subdir) {
  return path.join(__dirname, 'fixtures', subdir);
}

const refs = [
  {
    id: 'dataTypes',
    definitions: {
      primaryKey: {
        allOf: [
          {
            type: 'integer',
          }, {
            minimum: 1,
          }, {
            primaryKey: true,
          }, {
            autoIncrement: true,
          },
        ],
      },
    },
  },
];

let jss = null;

/* global beforeEach, describe, it */

describe('JSONSchemaSequelizer()', () => {
  describe('basic definitions', () => {
    beforeEach(() => {
      jss = t.setup({
        dialect: 'sqlite',
        storage: ':memory:',
      }, refs, dir('basic'));

      return jss.scan().sync();
    });

    it('supports the v4 API', () => {
      const x = new jss.models.Prototype();

      expect(x.chain()).to.eql(x);
      expect(jss.models.Prototype.truth()).to.eql(42);
      expect(typeof (new jss.models.Example({
        name: 'foo',
      })).destroy).to.eql('function');
      expect(typeof (new jss.models.Example({
        name: 'foo',
      })).save().then).to.eql('function');
    });

    it('should export all given models', () => {
      expect(jss.models.Example).not.to.be.undefined;
      return expect(Object.keys(jss.models).sort()).to.eql(['Example', 'Prototype']);
    });

    it('should support basic operations', () => {
      return jss.models.Example.create({
        name: 'OSOM',
      }).then(b => {
        expect(b.get('name')).to.eql('OSOM');
        expect(b.now instanceof Date).to.eql(true);
      });
    });
  });

  describe('virtual types', () => {
    beforeEach(() => {
      jss = t.setup({
        dialect: 'sqlite',
        storage: ':memory:',
      }, refs, dir('virtual-types'));

      return jss.scan().sync();
    });

    it('it should accept virtual types', () => {
      return jss.models.Basic.create({
        foo: 'bar',
        baz: 'buzz',
      }).then(result => {
        expect(result.foo).to.eql('bar');
        expect(result.baz).to.be.undefined;
      });
    });
  });

  describe('relations / associations', () => {
    it('should create a new connection in-memory (sqlite testing)', () => {
      jss = t.setup({
        dialect: 'sqlite',
        storage: ':memory:',
      }, refs, dir('relations/blog_site'));

      return jss.scan().sync();
    });

    it('should associate <prop>.items.$ref as hasMany', () => {
      return jss.models.Blog.create({
        name: 'Test',
        myPosts: [
          {
            title: 'Hello World',
            body: 'JSON-Schema rocks!',
          },
        ],
      }, {
        include: [jss.models.Blog.associations.myPosts],
      }).then(firstBlog => {
        expect(firstBlog.myPosts[0].get('title')).to.eql('Hello World');
      });
    });

    it('should associate <prop>.$ref as hasOne', () => {
      return jss.models.Blog.create({
        name: 'Test',
        featuredPost: {
          title: 'OSOM',
          body: 'OK',
        },
      }, {
        include: [jss.models.Blog.associations.featuredPost],
      }).then(firstBlog => {
        expect(firstBlog.featuredPost.get('title')).to.eql('OSOM');
      });
    });

    it('should support other keywords too', () => {
      return jss.models.Person.create({
        name: 'Gran Ma',
        children: [
          {
            name: 'Ma',
          }, {
            name: 'Uncle',
          },
        ],
      }, {
        include: [jss.models.Person.associations.children],
      }).then(familyTree => {
        expect(familyTree.get('id')).to.eql(1);
        expect(familyTree.get('name')).to.eql('Gran Ma');
        expect(familyTree.children[1].get('id')).to.eql(3);
        expect(familyTree.children[1].get('name')).to.eql('Uncle');
      });
    });
  });
});
