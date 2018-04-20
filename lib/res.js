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

function _fixRefs(refs, values) {
  // FIXME: consider apply this recursively?
  Object.keys(refs).forEach(ref => {
    /* istanbul ignore else */
    if (Array.isArray(values[ref]) && refs[ref] && refs[ref].through) {
      const through = typeof refs[ref].through === 'object'
        ? refs[ref].through.model
        : refs[ref].through;

      values[ref] = values[ref].map(item => {
        const sub = item[through];

        delete item[through];

        sub[refs[ref].model] = item;

        return sub;
      });
    }
  });
}

function _expandData(raw, props, attachments) {
  /* istanbul ignore else */
  if (!props || typeof props !== 'object') {
    return props;
  }

  /* istanbul ignore else */
  if (Array.isArray(props)) {
    // transform the result before finishing the response
    return props.map(x => _expandData(raw, x, attachments));
  }

  /* istanbul ignore else */
  if (props.dataValues) {
    return raw ? props : _expandData(raw, props.dataValues, attachments);
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
        props[key] = _expandData(raw, value, attachments);
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

function _getData(data, from, props) {
  return props.reduce((prev, cur, i) => {
    if (typeof from[i] !== 'undefined' && typeof props[i] !== 'undefined') {
      prev[from[i]] = data[props[i]];
    }

    return prev;
  }, {});
}

function _buildTasks(references, inputData, modelName, _options, models) {
  _saveUploads(inputData, _options.attachments || []);

  const tasks = [];

  Object.keys(inputData).forEach(prop => {
    const ref = references[prop];

    /* istanbul ignore else */
    if (ref) {
      /* istanbul ignore else */
      if (Array.isArray(inputData[prop])) {
        inputData[prop].forEach(item => {
          _saveUploads(item, _options.attachments || []);

          /* istanbul ignore else */
          if (ref.through) {
            const _method = _util.camelize(`create-${_util.singularize(prop)}`);
            const through = typeof ref.through.model === 'string' ? ref.through.model : ref.through;
            const allPKs = ref.references.primaryKeys.map(x => x.prop);
            const allFKs = ref.references.foreignKeys.map(x => x.prop);

            const where = {};
            const keys = [];

            allFKs.forEach(k => {
              if (item[k]) {
                where[k] = item[k];
                delete item[k];
              } else {
                keys.push(k);
              }
            });

            if (item[ref.model]) {
              const value = item[ref.model];

              delete item[ref.model];

              tasks.push(row => {
                const mixedProps = util.merge({}, where, _getData(row, allFKs, allPKs));

                /* istanbul ignore else */
                if (!allFKs.every(x => mixedProps[x])) {
                  return Promise.resolve()
                    .then(() => {
                      /* istanbul ignore else */
                      if (typeof row[_method] !== 'function') {
                        return models[modelName].findOne({ where: row });
                      }
                    })
                    .then(foundRow => {
                      return (foundRow || row)[_method](value, {
                        through: item,
                      });
                    });
                }

                return models[through].update(item, { where: mixedProps });
              });
            } else {
              tasks.push(row => {
                const mixedProps = util.merge({}, where, _getData(row, allFKs, allPKs));

                /* istanbul ignore else */
                if (allFKs.every(x => mixedProps[x])) {
                  util.merge(item, mixedProps);

                  return models[through].create(item);
                }

                /* istanbul ignore else */
                if (keys.length > 0) {
                  util.merge(where, mixedProps);
                }

                return models[through].update(item, { where });
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

function _pushKeys(model, obj) {
  Object.keys(model.primaryKeys).forEach(key => {
    if (obj.attributes.indexOf(key) === -1) {
      obj.attributes.unshift(key);
    }
  });
}

function _packOptions(action, model, obj) {
  obj.attributes = (obj.attributes || []).slice();
  obj.include = (obj.include || []).slice();

  if (action.indexOf('find') === 0) {
    _pushKeys(model, obj);
  }

  Object.keys(obj).forEach(key => {
    /* istanbul ignore else */
    if (!Array.isArray(obj[key]) && typeof obj[key] === 'object' && obj[key] !== null && model.associations[key]) {
      const target = model.associations[key].target;
      const props = _packOptions(action, target, obj[key] || {});

      /* istanbul ignore else */
      if (obj.where && obj.where[key]) {
        if (model.associations[key].through) {
          props.through = {
            attributes: Object.keys(obj.where[key]),
            model: model.associations[key].through.model,
            where: obj.where[key],
          };

          _pushKeys(model.associations[key].through.model, props.through);
        } else {
          props.where = obj.where[key];
        }

        delete obj.where[key];
      }

      /* istanbul ignore else */
      if (props.order && typeof props.order[0] === 'string') {
        props.order.unshift({
          model: target,
          as: key,
        });

        obj.order = obj.order || [];

        /* istanbul ignore else */
        if (obj.order[0] && typeof obj.order[0][0] !== 'object') {
          obj.order = [obj.order];
        }

        obj.order.push(props.order);

        delete props.order;
      }

      switch (action) {
        case 'findAll':
        case 'findOne':
          props.model = target;
          props.as = key;

          obj.include.push(props);
          break;

        case 'destroy':
          obj.include.push(model.associations[key]);
          break;

        // nothing to do
        default: break;
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
    if (!key || props[field]) {
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
  if (!models || typeof deps[modelName] !== 'object') {
    throw new Error(`Expecting model definition, given '${deps[modelName] || modelName}'`);
  }

  const model = models[modelName];

  options = options || {};
  options.keys = options.keys || [];

  const _where = {};
  const _props = {};

  Object.keys(model.primaryKeys).sort()
    .forEach((pk, i) => {
      /* istanbul ignore else */
      if (typeof options.keys[i] !== 'undefined') {
        _where[pk] = options.keys[i];
      }
    });

  /* istanbul ignore else */
  if (typeof options.where === 'string') {
    const p = options.where.split(';');

    p.forEach(v => {
      const s = v.split(':').filter(Boolean);

      _where[s[0]] = s.length === 2
        ? s[1]
        : s;
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
      model: modelName,
      refs: _props,
      schema: _schema,
      uiSchema: model.options.$uiSchema || {},
      attributes: model.options.$attributes || {},
    },
  };

  function ok(result) {
    const data = _expandData(!options.raw, result, options.attachments || []);

    if (Array.isArray(data)) {
      data.forEach(x => _fixRefs(_props, x));
    } else {
      _fixRefs(_props, data);
    }

    return data;
  }

  function err(error) {
    if (options.fallthrough) {
      instance.options.failure = error.message;
    } else {
      throw error;
    }

    return null;
  }

  function build(payload, isUpdate, _options) {
    _options = _options || {};
    _options.where = _options.where || _where;

    const _payload = payload || options.payload;
    const _tasks = _buildTasks(_props, _payload, model.name, options, models);
    const _opts = _getOpts(model, _props, isUpdate ? 'update' : 'create', _options);

    return Promise.resolve()
      .then(() => model[isUpdate ? 'update' : 'create'](_payload, _opts))
      .then(row => {
        /* istanbul ignore else */
        if (Array.isArray(row)) {
          row = _props[model.name].references.primaryKeys
            .reduce((prev, cur) => {
              prev[cur.prop] = _opts.where[cur.prop];
              return prev;
            }, {});
        }

        return _tasks
          .reduce((prev, cur) => {
            return prev.then(() => cur(row));
          }, Promise.resolve())
          .then(() => row);
      })
      .then(ok)
      .catch(err);
  }

  function fetch(method, _options) {
    _options = _options || {};
    _options.where = _options.where || _where;

    const _opts = _getOpts(model, _props, method, _options);

    return Promise.resolve()
      .then(() => model[method](_opts))
      .then(ok)
      .catch(err);
  }

  instance.actions = {
    update: (payload, _options) => build(payload, true, _options),
    findAll: _options => fetch('findAll', _options),
    findOne: _options => fetch('findOne', _options),
    destroy: _options => fetch('destroy', _options),
    count: _options => fetch('count', _options),
    create: payload => build(payload),
  };

  return instance;
};
