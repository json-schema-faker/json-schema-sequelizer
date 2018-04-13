'use strict';

const _util = require('sequelize/lib/utils');

const util = require('./util');
const types = require('./types');

const fs = require('fs-extra');
const path = require('path');

const RE_DATA = /^data:(.+?);base64,/;

function _fixData(props) {
  const name = path.basename(props.fileName);
  const content = fs.readFileSync(props.filePath).toString('base64');

  return `data:${props.mimeType};name=${name};base64,${content}`;
}

function _expandData(props, attachments) {
  /* istanbul ignore else */
  if (!props || typeof props !== 'object') {
    return props;
  }

  /* istanbul ignore else */
  if (props.dataValues) {
    props.dataValues = _expandData(props.dataValues, attachments);

    return props;
  }

  /* istanbul ignore else */
  if (typeof props.mimeType !== 'undefined'
    && typeof props.fileSize !== 'undefined'
    && typeof props.fileName !== 'undefined'
    && typeof props.filePath !== 'undefined'
    && attachments[0] && typeof props[attachments[0].key] === 'undefined') {
    props[attachments[0].key] = _fixData(props);
    return props;
  }

  Object.keys(props).forEach(key => {
    const value = props[key];

    /* istanbul ignore else */
    if (value && typeof value === 'object') {
      if (typeof value.mimeType !== 'undefined'
        && typeof value.fileSize !== 'undefined'
        && typeof value.fileName !== 'undefined'
        && typeof value.filePath !== 'undefined') {
        props[key] = _fixData(value);
      } else {
        props[key] = _expandData(value, attachments);
      }
    }
  });

  return props;
}

function _saveUploads(payload, attachments) {
  attachments.forEach(upload => {
    /* istanbul ignore else */
    if (payload[upload.key]) {
      const details = payload[upload.key].match(RE_DATA)[1].split(';');
      const base64Data = payload[upload.key].replace(RE_DATA, '');

      delete payload[upload.key];

      const fileName = `${base64Data.substr(0, 7)}/${details[1].split('name=')[1]}`;

      const destFile = path.join(upload.dest, fileName);

      fs.outputFileSync(destFile, base64Data, 'base64');

      payload.filePath = path.relative(upload.baseDir || process.cwd(), destFile);
      payload.fileName = fileName.replace(/^\/+/, '');
      payload.fileSize = fs.statSync(destFile).size;
      payload.mimeType = details[0];
    }
  });
}

function _buildTasks(references, inputData, modelName, _options, models) {
  _saveUploads(inputData, _options.attachments || []);

  const tasks = {
    options: {
      include: [],
    },
    before: [],
    after: [],
  };

  Object.keys(inputData).forEach(prop => {
    const ref = references[prop];

    /* istanbul ignore else */
    if (ref) {
      const pk = models[modelName].primaryKeyAttribute;

      /* istanbul ignore else */
      if (Array.isArray(inputData[prop])) {
        inputData[prop].forEach(item => {
          _saveUploads(item, _options.attachments || []);

          /* istanbul ignore else */
          if (ref.through) {
            const through = typeof ref.through.model === 'string' ? ref.through.model : ref.through;
            const key = ref.references.foreignKeys.filter(k => {
              return typeof item[k.prop] === 'undefined';
            })[0].prop;

            if (item[ref.model]) {
              const sub = item[ref.model];

              delete item[ref.model];

              tasks.after.push((row, isUpdate) => {
                const _method = _util.camelize(`create-${_util.singularize(prop)}`);

                /* istanbul ignore else */
                if (isUpdate) {
                  throw new Error(`Refuse to update model '${ref.model}'`);
                }

                return row[_method](sub, {
                  through: item,
                });
              });
            } else {
              tasks.after.push((row, isUpdate) => {
                const opts = {};

                if (isUpdate) {
                  opts.where = {
                    [key]: row[0],
                  };

                  ref.references.foreignKeys.forEach(_key => {
                    /* istanbul ignore else */
                    if (item[_key.prop]) {
                      opts.where[_key.prop] = item[_key.prop];
                      delete item[_key.prop];
                    }
                  });
                } else {
                  item[key] = row[pk];
                }

                return models[through][isUpdate ? 'update' : 'create'](item, opts);
              });
            }
          }
        });

        delete inputData[prop];
      }
    }
  });

  return tasks;
}

function _mixOptions(source, target) {
  /* istanbul ignore else */
  if (source) {
    Object.keys(source).forEach(key => {
      if (!target[key]) {
        target[key] = source[key];
      } else {
        target[key] = _mixOptions(source[key], target[key] || {});
      }
    });
  }

  return target;
}

function _packOptions(action, model, obj) {
  /* istanbul ignore else */
  if (model.primaryKeyAttribute && obj.attributes.indexOf(model.primaryKeyAttribute) === -1) {
    obj.attributes.unshift(model.primaryKeyAttribute);
  }

  Object.keys(obj).forEach(key => {
    /* istanbul ignore else */
    if (!Array.isArray(obj[key]) && typeof obj[key] === 'object' && obj[key] !== null && model.associations[key]) {
      const target = model.associations[key].target;
      const props = _packOptions(action, target, obj[key]);

      /* istanbul ignore else */
      if (obj.where && obj.where[key]) {
        props.required = false;
        props.where = obj.where[key];

        delete obj.where[key];
      }

      switch (action) {
        case 'findAll':
        case 'findOne':
          /* istanbul ignore else */
          if (target.primaryKeyAttribute && props.attributes.indexOf(target.primaryKeyAttribute) === -1) {
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

function _getOpts(model, props, action, params) {
  const fields = util.merge({}, model.options.$attributes || {});
  const attrs = fields[action]
    || fields.findAll
    || [];

  const obj = {
    include: [],
    attributes: [],
  };

  /* istanbul ignore else */
  if (fields.where) {
    params.where = util.merge(params.where, fields.where);
  }


  attrs.forEach(field => {
    const key = typeof field === 'object'
      ? field.prop
      : field;

    /* istanbul ignore else */
    if (!key) {
      return;
    }

    /* istanbul ignore else */
    if (props[field]) {
      obj.include.push(model.associations[field]);
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

  // append foreign-keys
  Object.keys(model.rawAttributes).forEach(prop => {
    /* istanbul ignore else */
    if (model.rawAttributes[prop].references && obj.attributes.indexOf(prop) === -1) {
      obj.attributes.push(prop);
    }
  });

  return _packOptions(action, model, _mixOptions(params, obj));
}

module.exports = (deps, models, options, modelName) => {
  /* istanbul ignore else */
  if (typeof options === 'string') {
    modelName = options;
    options = null;
  }

  /* istanbul ignore else */
  if (!deps || !models || typeof deps[modelName] !== 'object') {
    throw new Error(`Expecting model definition, given '${deps[modelName] || modelName}'`);
  }

  const model = models[modelName];

  options = options || {};

  // FIXME: allow multiple PKs
  const _primaryKey = model.primaryKeyAttribute;

  /* istanbul ignore else */
  if (!_primaryKey) {
    throw new Error(`Missing ${modelName}.primaryKeyAttribute value, given '${_primaryKey}'`);
  }

  const _where = {};
  const _props = {};

  /* istanbul ignore else */
  if (typeof options[_primaryKey] !== 'undefined') {
    _where[_primaryKey] = options[_primaryKey];
  }

  /* istanbul ignore else */
  if (options.where) {
    const p = options.where.split(';');

    p.forEach(v => {
      _where[v.split(':')[0]] = v.split(':')[1];
    });
  }

  const _schema = types.cleanSchema(model.options.$schema || {});

  // delete private references
  Object.keys(model.rawAttributes).forEach(prop => {
    /* istanbul ignore else */
    if (model.rawAttributes[prop].references) {
      delete _schema.properties[prop];
    }
  });

  function push(ref, nested) {
    // attribute references
    _props[ref.params.as] = {
      rel: ref.method,
      model: ref.target,
      plural: _util.pluralize(ref.target),
      singular: _util.singularize(ref.target),
      through: ref.params.through,
      references: deps[ref.target].$references,
      requiredProps: (deps[ref.target].$schema.required || []).slice(),
    };

    _props[ref.params.as].references.foreignKeys = ref.foreignKeys || [];

    /* istanbul ignore else */
    if (nested > 0) {
      _props[ref.params.as].uiSchema = deps[ref.target].$uiSchema || {};
    }
  }

  function append(id, nested) {
    Object.keys(deps[id].$dependencies).forEach(dep => {
      const ref = deps[id].$dependencies[dep];

      push(ref, nested);

      /* istanbul ignore else */
      if (!nested) {
        return;
      }

      const fields = deps[id].$schema.properties;

      // append references from virtual-models
      Object.keys(fields).forEach(prop => {
        const _ref = (fields[prop].items || fields[prop]).$ref;

        /* istanbul ignore else */
        if (deps[_ref]) {
          _props[_ref] = deps[_ref].$schema;

          append(_ref, deps[id].$schema.virtual ? 0 : (nested - 1));
        }
      });
    });
  }

  // model references
  _props[modelName] = util.merge({
    model: modelName,
  }, model.options.name);

  _props[modelName].references = deps[modelName].$references;

  append(modelName, 1);

  // shared resource
  const instance = {
    options: {
      refs: _props,
      schema: _schema,
      uiSchema: model.options.$uiSchema || {},
      attributes: model.options.$attributes || {},
    },
  };

  function ok(result) {
    /* istanbul ignore else */
    if (Array.isArray(result)) {
      // transform the result before finishing the response
      return result.map(x => _expandData(x, options.attachments || []));
    }

    return _expandData(result, options.attachments || []);
  }

  function err(error) {
    if (options.fallthrough) {
      instance.options.failure = error.message;
    } else {
      throw error;
    }

    return null;
  }

  function build(payload, isUpdate, whereOptions) {
    const _payload = payload || options.payload;

    const test = _buildTasks(_props, _payload, model.name, options, models);

    test.options.where = _mixOptions(test.options.where, whereOptions || _where) || {};

    return Promise.resolve()
      .then(() => {
        const row = test.options.where;

        return test.before.reduce((prev, cur) => {
          return prev.then(() => cur(row, isUpdate));
        }, Promise.resolve());
      })
      .then(() => model[isUpdate ? 'update' : 'create'](_payload, test.options))
      .then(row => {
        return test.after.reduce((prev, cur) => {
          return prev.then(() => cur(row, isUpdate));
        }, Promise.resolve()).then(() => row);
      })
      .then(ok)
      .catch(err);
  }

  function fetch(method, _options) {
    _options = _options || {};
    _options.where = _options.where || _where;

    return Promise.resolve()
      .then(() => model[method](_getOpts(model, _props, method, _options)))
      .then(ok)
      .catch(err);
  }

  instance.actions = {
    update: (payload, whereOptions) => build(payload, true, whereOptions),
    findAll: whereOptions => fetch('findAll', whereOptions),
    findOne: whereOptions => fetch('findOne', whereOptions),
    destroy: whereOptions => fetch('destroy', whereOptions),
    count: whereOptions => fetch('count', whereOptions),
    create: payload => build(payload),
  };

  return instance;
};
