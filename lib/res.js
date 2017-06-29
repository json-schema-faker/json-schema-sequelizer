'use strict';

const debug = require('debug')('json-schema-sequelizer');

const util = require('./util');

const ACTIONS = {
  index: '',
  new: 'new',
  edit: 'edit',
  show: 'show',
  create: 'create',
  update: 'update',
  delete: 'destroy',
};

function _fixParams(schema, data, props) {
  /* istanbul ignore else */
  if (!(schema && schema.properties)) {
    throw new Error(`Missing properties for ${JSON.stringify(schema)}`);
  }

  Object.keys(schema.properties).forEach(prop => {
    /* istanbul ignore else */
    if (props[prop] && props[prop].type === 'BelongsTo') {
      // FIXME: adjust from PKs
      data[`${prop}Id`] = data[prop] ? data[prop].id : null;
      delete data[prop];
    }
  });

  return data;
}

function mix(s, t) {
  /* istanbul ignore else */
  if (s) {
    Object.keys(s).forEach(k => {
      if (!t[k]) {
        t[k] = s[k];
      } else {
        t[k] = mix(s[k], t[k] || {});
      }
    });
  }

  return t;
}

function pack(action, model, obj) {
  /* istanbul ignore else */
  if (obj.attributes.indexOf(model.primaryKeyAttribute) === -1) {
    obj.attributes.unshift(model.primaryKeyAttribute);
  }

  Object.keys(obj).forEach(key => {
    /* istanbul ignore else */
    if (!Array.isArray(obj[key]) && typeof obj[key] === 'object' && obj[key] !== null && model.refs[key]) {
      const target = model.refs[key].target;
      const props = pack(action, target, obj[key]);

      switch (action) {
        case 'index':
        case 'edit':
        case 'show':
          /* istanbul ignore else */
          if (props.attributes.indexOf(target.primaryKeyAttribute) === -1) {
            props.attributes.unshift(target.primaryKeyAttribute);
          }

          props.model = target;
          props.as = key;

          obj.include.push(props);
          break;

        default:
          obj.include.push(model.refs[key]);
          break;
      }

      delete obj[key];
    }
  });

  return obj;
}

function _getOpts(model, action, params) {
  /* istanbul ignore else */
  if (action === 'update' || action === 'create' || action === 'destroy') {
    // write operations works better with all-nested
    return mix(params, {
      include: [{ all: true, nested: true }],
    });
  }

  const fields = model.options.$uiFields || {};
  const props = fields[action]
    || fields.index
    || [];

  const obj = {
    include: [],
    attributes: [],
  };

  /* istanbul ignore else */
  if (model.options.defaultScope && Array.isArray(model.options.defaultScope.attributes)) {
    obj.attributes = model.options.defaultScope.attributes.slice();
  }

  props.forEach(x => {
    const key = typeof x === 'object' ? x.prop : x;

    if (key.indexOf('.') === -1) {
      obj.attributes.push(key);
    } else {
      const keys = key.split('.');

      let u = obj;
      let k;

      while (keys.length > 1) {
        k = keys.shift();

        /* istanbul ignore else */
        if (!u[k]) {
          u[k] = {
            include: [],
            attributes: [],
          };
        }

        u = u[k];
      }

      u.attributes.push(keys[0]);
    }
  });

  return pack(action, model, mix(params, obj));
}

function add(name, routes, actions) {
  /* istanbul ignore else */
  if (!routes) {
    throw new Error(`Missing routes for ${name}`);
  }

  actions[name] = {};

  Object.keys(ACTIONS).forEach(key => {
    actions[name][key] = {
      url: ACTIONS[key] && routes[ACTIONS[key]]
        ? routes[ACTIONS[key] || key].url
        : routes.url,
      path: ACTIONS[key] && routes[ACTIONS[key]]
        ? routes[ACTIONS[key] || key].path
        : routes.path,
      method: ACTIONS[key] && routes[ACTIONS[key]]
        ? routes[ACTIONS[key] || key].verb
        : routes.verb,
    };
  });
}

function push(model, seen, cb) {
  /* istanbul ignore else */
  if (seen.indexOf(model) > -1) {
    return;
  }

  seen.push(model);

  if (!model.refs) {
    throw new Error(`Missing refs for '${JSON.stringify(model)}'`);
  }

  Object.keys(model.refs).map(key => model.refs[key].target)
    .forEach(m => {
      push(m, seen, cb);
      cb(m);
    });
}

module.exports = (ctx, model, action) => {
  /* istanbul ignore else */
  if (!(ctx.routes && ctx.params && ctx.resources)) {
    throw new Error(`Missing context object, given: ${JSON.stringify(ctx)}`);
  }

  /* istanbul ignore else */
  if (typeof model.name !== 'string') {
    throw new Error(`Expecting sequelize model, given '${model}'`);
  }

  const _actions = {};
  const _models = {};
  const _where = {};
  const _props = {};
  const _seen = [];

  // FIXME: exports useful props somewhere...
  _where[model.primaryKeyAttribute] = ctx.params.id || -1;

  /* istanbul ignore else */
  if (!ctx.resources[model.name]) {
    throw new Error(`Missing ${model.name} resource`);
  }

  add(model.name, ctx.routes(ctx.resources[model.name].controller), _actions);

  push(model, _seen, m => {
    /* istanbul ignore else */
    if (!ctx.resources[m.name]) {
      throw new Error(`Missing ${m.name} resource`);
    }

    add(m.name, ctx.routes(ctx.resources[m.name].controller), _actions);
  });

  if (!model.refs) {
    throw new Error(`Missing refs for '${JSON.stringify(model)}'`);
  }

  Object.keys(model.refs)
    .forEach(ref => {
      _props[ref] = {
        type: model.refs[ref].associationType,
        model: model.refs[ref].target.name,
      };

      /* istanbul ignore else */
      if (!_models[model.refs[ref].target.name]) {
        _models[model.refs[ref].target.name] = {
          schema: model.refs[ref].target.options.$schema,
          uiSchema: model.refs[ref].target.options.$uiSchema,
        };
      }
    });

  const resource = util.merge({}, {
    $schema: model.options.$schema || {},
    $uiSchema: model.options.$uiSchema || {},
    $uiFields: model.options.$uiFields || {},
    $actions: _actions,
    $models: _models,
    $model: model.name,
    $refs: _props,
  });

  return Promise.resolve()
    .then(() => {
      // FIXME: how-to fake?
      switch (action) {
        case 'index':
          return model.findAll(_getOpts(model, action))
            .then(data => {
              debug('Data found (%s row%s)', data.length, data.length === 1 ? '' : 's');

              resource.$data = data;
            });

        case 'new':
          resource.$isNew = true;
          break;

        case 'show':
        case 'edit':
          return model.findOne(_getOpts(model, action, { where: _where }))
            .then(data => {
              /* istanbul ignore else */
              if (!data) {
                debug('Row not found');

                throw new Error('Row not found');
              }

              debug('Row found');

              resource.$data = data;
            });

        case 'update':
          debug('Updating resource %s', JSON.stringify(_where));

          return Promise.resolve()
            .then(() => {
              const _pk = {};

              // FIXME: use proper fields
              _pk[`${model.name}Id`] = ctx.params.id;

              const payload = _fixParams(model.options.$schema, ctx.params.payload, _props);

              return Promise.all(Object.keys(_props)
                .map(key =>
                  _props[key].type === 'HasOne'
                  && (payload[key].id
                    ? model.refs[key].target.update(payload[key], {
                      where: { id: payload[key].id },
                    })
                    : model.refs[key].target.create(util.merge(_pk, payload[key]))
                  )))
                .then(() => model.update(payload, _getOpts(model, action, { where: _where })));
            })
            .then(modified => ({ modified }));

        case 'create':
          debug('Creating resource with [%s]', Object.keys(ctx.params.payload).join(', '));

          return model.create(_fixParams(model.options.$schema, ctx.params.payload, _props), _getOpts(model, action));

        case 'destroy':
          debug('Destroying resource', JSON.stringify(_where));

          return model.destroy(_getOpts(model, action, { where: _where }));

        default:
          throw new Error(`Unsupported action ${action}`);
      }
    })
    .catch(error => {
      // capture'em all!
      resource.$failure = error.message;

      return null;
    })
    .then(result => {
      // pass given result
      resource.$result = result;

      return resource;
    });
};
