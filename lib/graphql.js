'use strict';

const glob = require('glob');
const path = require('path');
const fs = require('fs');

module.exports = (models, paths, ctx) => {
  let _schema;

  paths = paths || [];

  if (!Array.isArray(paths)) {
    ctx = paths;
  }

  const graphql = require('graphql').graphql;
  const graphqlSequelize = require('graphql-sequelize');
  const mergeTypes = require('merge-graphql-schemas').mergeTypes;
  const mergeResolvers = require('merge-graphql-schemas').mergeResolvers;
  const makeExecutableSchema = require('graphql-tools').makeExecutableSchema;

  // static interface
  const _graphql = queryString => graphql(_schema, queryString);

  // attach references
  _graphql.schemas = [];
  _graphql.resolvers = [];

  // attach graphql-sequelize
  _graphql.sequelize = modelName => {
    let _wrapper;

    return function resolver() {
      const model = models[modelName];

      try {
        if (!_wrapper) {
          _wrapper = graphqlSequelize.resolver(model);
        }
      } catch (e) {
        throw new Error(`Unable to resolve(${modelName}). ${e.message}`);
      }

      return _wrapper.apply(null, arguments);
    };
  };

  // instantiate types and such
  Object.keys(models).forEach(name => {
    if (models[name].options.$graphql) {
      if (typeof models[name].options.$graphql === 'string') {
        _graphql.schemas.push(models[name].options.$graphql.trim());
      }

      if (models[name].options.graphqlMutators) {
        _graphql.resolvers.push(models[name].options.graphqlMutators);
      }

      if (models[name].options.graphqlResolvers) {
        _graphql.resolvers.push(models[name].options.graphqlResolvers);
      }

      if (!models[name].virtual) {
        const fields = graphqlSequelize.attributeFields(models[name]);

        Object.keys(models[name].attributes).forEach(k => {
          const values = models[name].attributes[k].type.values;
          const field = fields[k].type.name;

          if (field && values) {
            _graphql.schemas.push(`enum ${field} {\n  ${values.join('\n  ')}\n}`);
          }
        });

        _graphql.schemas.push(`type ${name} {\n  ${Object.keys(fields)
          .map(k => `${k}: ${fields[k].type}`)
          .join('\n  ')}\n}`);
      }
    }
  });

  // other sources
  paths.forEach(baseDir => glob.sync('**/*.{js,graphql}', { cwd: baseDir })
    .forEach(file => {
      const name = path.basename(file);

      if (name === 'resolvers.js' || name === 'mutators.js') {
        let resolver = require(path.join(baseDir, file));

        if (typeof resolver === 'function') {
          resolver = resolver(ctx);
        }

        _graphql.resolvers.push(resolver);
      }

      if (name === 'schema.graphql') {
        _graphql.schemas.push(fs.readFileSync(path.join(baseDir, file)).toString().trim());
      }
    }));

  if (!_graphql.schemas.length) {
    throw new Error('Missing schemas for GraphQL');
  }

  if (!_graphql.resolvers.length) {
    throw new Error('Missing resolvers for GraphQL');
  }

  try {
    _schema = makeExecutableSchema({
      typeDefs: mergeTypes(_graphql.schemas),
      resolvers: mergeResolvers(_graphql.resolvers),
    });
  } catch (e) {
    throw new Error(`Unable to start GraphQL. ${e.message}`);
  }

  return _graphql;
};
