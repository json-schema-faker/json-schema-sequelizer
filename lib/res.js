'use strict';

const types = require('./types');

function _fixParams(schema, data, props) {
  /* istanbul ignore else */
  if (!(schema && schema.properties)) {
    throw new Error(`Missing properties for ${JSON.stringify(schema)}`);
  }

  Object.keys(schema.properties).forEach(prop => {
    /* istanbul ignore else */
    if (props[prop] && props[prop].type === 'BelongsTo') {
      const copy = data[prop] ? data[prop][props[prop].primaryKey] : null;
      const fk = props[prop].foreignKey;

      delete data[prop];

      data[fk] = copy;
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
    if (!Array.isArray(obj[key]) && typeof obj[key] === 'object' && obj[key] !== null && model.associations[key]) {
      const target = model.associations[key].target;
      const props = pack(action, target, obj[key]);

      switch (action) {
        case 'findAll':
        case 'findOne':
          /* istanbul ignore else */
          if (props.attributes.indexOf(target.primaryKeyAttribute) === -1) {
            props.attributes.unshift(target.primaryKeyAttribute);
          }

          props.model = target;
          props.as = key;

          obj.include.push(props);
          break;

        default:
          obj.include.push(model.associations[key]);
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
      include: [
        {
          all: true,
          nested: true,
        },
      ],
    });
  }

  const fields = model.options.$uiFields || {};
  const props = fields[action]
    || fields.findAll
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

    /* istanbul ignore else */
    if (!key) {
      return;
    }

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

module.exports = (model, options) => {
  /* istanbul ignore else */
  if (!model || typeof model.name !== 'string') {
    throw new Error(`Expecting sequelize model, given '${model}'`);
  }

  const _primaryKey = model.primaryKeyAttribute;

  const _where = {};
  const _props = {};
  const _model = [];

  options = options || {};

  /* istanbul ignore else */
  if (options[_primaryKey]) {
    _where[_primaryKey] = options[_primaryKey];
  }

  /* istanbul ignore else */
  if (options.where) {
    const p = options.where.split(';');

    p.forEach(v => {
      _where[v.split(':')[0]] = v.split(':')[1];
    });
  }

  Object.keys(model.associations)
    .forEach(ref => {
      _props[ref] = {
        type: model.associations[ref].associationType,
        model: model.associations[ref].target.name,
        plural: model.associations[ref].target.options.name.plural,
        singular: model.associations[ref].target.options.name.singular,
        foreignKey: model.associations[ref].foreignKey,
        primaryKey: model.associations[ref].target.primaryKeyAttribute,
      };

      _model.push(model.associations[ref].target);
    });

  const _schema = types.cleanSchema(model.options.$schema || {});

  // set original references
  Object.keys(_props).forEach(prop => {
    if (_schema.properties[prop].items) {
      _schema.properties[prop].items.$ref = _props[prop].model;
    } else {
      _schema.properties[prop].$ref = _props[prop].model;
    }
  });

  // delete private references
  Object.keys(model.attributes).forEach(prop => {
    /* istanbul ignore else */
    if (model.attributes[prop].references) {
      delete _schema.properties[prop];
    }
  });

  // shared resource
  const instance = {
    options: {
      // model references
      ref: {
        primaryKey: model.primaryKeyAttribute,
        singular: model.options.name.singular,
        plural: model.options.name.plural,
        model: model.name,
      },

      // model associations
      refs: _props,

      // model schema and UI details
      schema: _schema,
      uiSchema: model.options.$uiSchema || {},
      uiFields: model.options.$uiFields || {},
    },
  };

  // append additional uiSchema settings
  _model.forEach(ref => {
    /* istanbul ignore else */
    if (ref.name !== model.name) {
      instance.options.uiSchema[ref.name] = ref.options.$uiSchema || {};
    }
  });

  function ok(result) {
    instance.result = result;

    return result;
  }

  instance.actions = {
    findAll: whereOptions =>
      model.findAll(_getOpts(model, 'findAll', { where: whereOptions || _where }))
        .then(ok),

    findOne: whereOptions =>
      model.findOne(_getOpts(model, 'findOne', { where: whereOptions || _where }))
        .then(ok),

    update: (payload, whereOptions) =>
      Promise.resolve()
        .then(() => {
          const _payload = _fixParams(model.options.$schema, payload || options.payload, _props);

          return Promise.resolve()
            .then(() => {
              const tasks = [];

              Object.keys(_props).forEach(key => {
                const data = !Array.isArray(_payload[key])
                  ? [_payload[key]]
                  : _payload[key];

                delete _payload[key];

                data.forEach(child => {
                  // FIXME: use proper array/object values
                  if (!child || !Object.keys(child).length) {
                    return;
                  }

                  child[_props[key].foreignKey] = (whereOptions && whereOptions[_primaryKey])
                    || options[_primaryKey] || _payload[_primaryKey];

                  if (!child[_props[key].primaryKey]) {
                    tasks.push(() =>
                      model.associations[key].target.create(child));
                  } else {
                    tasks.push(() =>
                      model.associations[key].target.update(child, {
                        where: {
                          [_props[key].primaryKey]: child[_props[key].primaryKey],
                        },
                      }));
                  }
                });
              });

              return Promise.all(tasks.map(cb => cb()));
            })
            .then(() => model.update(_payload, _getOpts(model, 'update', { where: whereOptions || _where })));
        })
        .then(ok),

    create: payload =>
      model.create(_fixParams(model.options.$schema, payload || options.payload, _props), _getOpts(model, 'create'))
        .then(ok),

    destroy: whereOptions =>
      model.destroy(_getOpts(model, 'destroy', { where: whereOptions || _where }))
        .then(ok),
  };

  return instance;
};
