# JSON-Schema Sequelizer

[![travis-ci](https://api.travis-ci.org/pateketrueke/json-schema-sequelizer.svg)](https://travis-ci.org/pateketrueke/json-schema-sequelizer) [![codecov](https://codecov.io/gh/pateketrueke/json-schema-sequelizer/branch/master/graph/badge.svg)](https://codecov.io/gh/pateketrueke/json-schema-sequelizer)

Declare your Sequelize models using JSON-Schema today!

```bash
$ npm i json-schema-sequelizer --save
```

_This is a **work in progress**, any feedback is very welcome!_

## Features

- Model definitions are JSON-Schema
- Associations are made from `$ref`s
- Migrations generator/runner
- Abstract CRUD builder

## Setup

```js
const JSONSchemaSequelizer = require('json-schema-sequelizer');

// connection settings for Sequelize
const settings = {
  dialect: 'sqlite',
  storage: ':memory:',
};

// external references (not models)
// can be an array or object
const definitions = {
  dataTypes: {
    definitions: {
      PK: {
        type: 'integer',
        minimum: 1,
        primaryKey: true,
        autoIncrement: true,
      },
    },
  },
};

// resolve local references from this directory
const builder = new JSONSchemaSequelizer(settings, definitions, process.cwd());
```

## Definition

```js
// add a dummy model
builder.add({
  // the $schema object is required at top-level
  $schema: {
    // model options placed here can be persisted
    options: {
      paranoid: true,
      timestamps: false,
    },

    // the $schema.id is required (don't forget it!)
    id: 'Tag',

    // model fields
    properties: {
      // resolved from an external/local reference (see below)
      id: {
        $ref: 'dataTypes#/definitions/PK',
      },

      // regular fields
      name: {
        type: 'string',
      },

      // ID-references are used for associating things
      children: {
        items: {
          $ref: 'Tag',
        },
      },
    },
    required: ['id', 'name'],
  },
  // any other property will be used as the model definition
  hooks: {},
  getterMethods: {},
  setterMethods: {},
  classMethods: {},
  instanceMethods: {},
  // etc.
});
```

## Basic usage

```js
builder.connect()
  .then(() => builder.models.Tag.sync())
  .then(() => {
    // create a Tag with some children
    return builder.models.Tag.create({
      name: 'Root',
      children: [
        { name: 'Leaf' },
      ],
    }, {
      // including the association is simple
      include: [builder.models.Tag.associations.children]
    });
  })
  .then(tag => {
    console.log(tag.get('name')); // Root
    console.log(tag.children[0].get('name')); // Leaf
  })
```

## Migrations

### Snapshots

```js
  .then(() => {
    // built-in schemas from given models, e.g.
    const set = Object.keys(builder.models).map(m => builder.refs[m].$schema);

    // dump current schema
    const bundle = JSONSchemaSequelizer.bundle(set, definitions, 'Latest changes!');

    // save all schemas as single JSON-Schema
    require('fs').writeFileSync('current_schema.json', JSON.stringify(bundle, null, 2));

    // migrating from snapshots is easy
    return builder.rehydrate(bundle);
  })
```

### Generating code

```js
  .then(() => {
    // if true, all up/down/change calls will be merged
    const squashMigrations = true;

    // any diff from here will generate its migration code
    const previousBundle = {};

    // dump migration code
    return JSONSchemaSequelizer.generate(previousBundle, builder.models, squashMigrations)
      .then(result => {
        // save as module
        require('fs').writeFileSync('current_schema.js', result.code);

        // when saving migrations to disk, you can load them later
        // by instantiating a custom `umzug` wrapper
        const wrapper = JSONSchemaSequelizer.migrate(settings, {
          configFile: 'db/migrations.json',
          baseDir: 'db/migrations',
          logger(message) {
            console.log(message);
          },
        });

        return wrapper.up().then(() => {
          console.log('Done!');
        });
      });
  })
```

### Migrating from code

```js
  .then(() => {
    // if true, will bind the given arguments for run as migrations,
    // otherwise it will instantiate a `umzg` wrapper (see above)
    const bindMethods = true;

    // this can be a module, or json-object
    const options = require('./current_schema');

    // execute migration from code
    return JSONSchemaSequelizer
      .migrate(builder.sequelize, options, bindMethods)
      .up();
  })
  .catch(e => {
    console.log(e.stack);
  });
```

## Faking data

```js
builder.models.Tag
  .faked.findOne().then(result => {
    console.log(JSON.stringify(result, null, 2));
  });
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

- `hasOne` &larr; `{ x: { $ref: 'Model' } }`
- `hasMany` &larr; `{ x: { items: { $ref: 'Model' } } }`
- `belongsTo` &larr; `{ x: { $ref: 'Model', belongsTo: true } }`
- `belongsToMany` &larr; `{ x: { $ref: 'Model', belongsToMany: true } }`

Additionally you can pass an object to provide options to the association, e.g.

```js
{ x: { $ref: 'Model', belongsToMany: { through: 'OtherModel' } } }
```

Special keys like `model` and `through` are resolved before making the association.

E.g., if you've defined `OtherModel` it will be used instead, otherwise the options are passed as is to Sequelize (which in turn can create the intermediate table as well).

## Options

- `settings`
&mdash;

- `refs`
&mdash;

- `cwd`
&mdash;

## Instance properties

- `sequelize`
&mdash;

- `models`
&mdash;

- `refs`
&mdash;

## Instance methods

- `add()`
&mdash;

- `scan()`
&mdash;

- `sync()`
&mdash;

- `close()`
 &mdash;

- `connect()`
&mdash;

- `hydrate()`
 &mdash;

- `rehydrate()`
&mdash;

## Static methods

- `bundle(schemas, definitions, description)`
  &mdash;

- `generate(dump, models, definitions, squashMigrations)`
  &mdash;

- `resource(ctx, model, action)`
&mdash;

- `migrate(sequelize, options, bind)`
&mdash;

- `async(models, options)`
&mdash;

- `clear(models, options)`
&mdash;
