# JSON-Schema Sequelizer

[![travis-ci](https://api.travis-ci.org/pateketrueke/json-schema-sequelizer.svg)](https://travis-ci.org/pateketrueke/json-schema-sequelizer) [![codecov](https://codecov.io/gh/pateketrueke/json-schema-sequelizer/branch/master/graph/badge.svg)](https://codecov.io/gh/pateketrueke/json-schema-sequelizer)

Declare your Sequelize models using JSON-Schema today!

```bash
$ yarn add pateketrueke/json-schema-sequelizer
```

This is a **work in progress**, any feedback is very welcome!

## Basic usage

First you'll need a Sequelize connection, e.g.

```js
const JSONSchemaSequelizer = require('json-schema-sequelizer');
const Sequelize = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: ':memory:',
});
```

The next thing is declaring our models:

```js
const models = [
  {
    // the $schema object is required at top-level
    $schema: {
      id: 'Tag',
      properties: {
        // resolved from an external#/local reference (see below)
        id: { $ref: 'dataTypes#/definitions/id' },
        name: { type: 'string' },
        // other references are used for associating things
        children: { items: { $ref: 'Tag' } },
      },
      required: ['id', 'name'],
    },
  },
  // any other property will be used as the model definition
];
```

Optionally we can provide additional references to resolve external references:

```js
const refs = [
  {
    id: 'dataTypes',
    definitions: {
      id: { type: 'integer', primaryKey: true, autoIncrement: true },
    },
  },
];
```

Once we've defined everything is time to instantiate some objects:

```js
const m = JSONSchemaSequelizer(sequelize, models, refs);
```

Now, `m` is an object holding all our defined models, along with their associations.

Additionally we can call `m.sync()` to initialize our tables as needed.

```js
m.sync().then(() => {
  // create a Tag with some children
  m.Tag.create({
    name: 'Root',
    children: [
      { name: 'Leaf' },
    ],
  }, {
    // including the association is simple
    include: [m.Tag.refs.children]
  })
  .then((tag) => {
    console.log(tag.get('name')); // Root
    console.log(tag.children[0].get('name')); // Leaf
  });
});
```

Mocking models is far easier with JSON-Schema Faker:

```js
console.log(JSON.stringify(m.Tag.faked.findOne(), null, 2));
/*
{
  "id": -80610000,
  "name": "aute labore",
  "children": [
    {
      "id": -7795084,
      "name": "esse"
    },
    {
      "id": 99346362,
      "name": "quis esse",
      "children": [
        {
          "id": -90816751,
          "name": "do Lorem ea pariatur dolor"
        },
        {
          "id": -18992291,
          "name": "in sunt"
        },
        {
          "id": -12809524,
          "name": "in velit Duis",
          "children": [
            {
              "id": -74337843,
              "name": "in"
            }
          ]
        },
        {
          "id": 79733248,
          "name": "aliquip non consectetur adipisicing",
          "children": [
            {
              "id": -51084768,
              "name": "cillum ve"
            },
            {
              "id": 56603940,
              "name": "mollit do adipisicing velit dolore"
            }
          ]
        },
        {
          "id": 28572807,
          "name": "velit dolor laboris"
        }
      ]
    }
  ]
}
*/
```

## Associations

Relationships between models are declared with references:

- `hasOne` &larr; `{ "x": { "$ref": "Model" } }`
- `hasMany` &larr; `{ "x": { "items": { "$ref": "Model" } } }`
- `belongsTo` &larr; `{ "x": { "$ref": "Model", "belongsTo": true } }`
- `belongsToMany` &larr; `{ "x": { "$ref": "Model", "belongsToMany": true } }`
