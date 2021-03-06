const { buildErrObject, itemNotFound } = require('./utils');

/**
 * Builds sorting
 * @param {string} sort - field to sort from
 * @param {number} order - order for query (1,-1)
 */
const buildSort = (sort, order) => {
  const sortBy = [[sort, order === '1' ? 'ASC' : 'DESC']];
  return sortBy;
};

/**
 * Hack for mongoose-paginate, removes 'id' from results
 * @param {Object} result - result object
 */
const cleanPaginationID = (result) => {
  result.docs.map((element) => delete element.id);
  result = renameKey(result, 'docs', 'payload');
  return result;
};

function renameKey(object, key, newKey) {
  const clonedObj = { ...object };
  const targetKey = clonedObj[key];
  delete clonedObj[key];
  clonedObj[newKey] = targetKey;
  return clonedObj;
}

/**
 * Builds initial options for query
 * @param {Object} query - query object
 */
const listInitOptions = async (req) =>
  new Promise((resolve) => {
    const order = parseInt(req.query.order, 10) || 1;
    const sort = req.query.sort || 'createdAt';
    const sortBy = buildSort(sort, order);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 99999;
    const options = {
      order,
      sort: sortBy,
      page,
      limit,
    };
    resolve(options);
  });

module.exports = {
  /**
   * Checks the query string for filtering records
   * query.filter should be the text to search (string)
   * query.fields should be the fields to search into (array)
   * @param {Object} query - query object
   */
  listInitOptions,
  renameKey,
  async checkQueryString(query) {
    return new Promise((resolve, reject) => {
      try {
        if (
          typeof query.filter !== 'undefined' &&
          typeof query.fields !== 'undefined'
        ) {
          const data = {
            $or: [],
          };
          const array = [];
          // Takes fields param and builds an array by splitting with ','
          const arrayFields = query.fields.split(',');
          // Adds SQL Like %word% with regex
          arrayFields.map((item) => {
            array.push({
              [item]: {
                $regex: new RegExp(query.filter, 'i'),
              },
            });
            return true;
          });
          // Puts array result in data
          data.$or = array;
          resolve(data);
        } else {
          resolve({});
        }
      } catch (err) {
        console.log(err.message);
        reject(buildErrObject(422, 'ERROR_WITH_FILTER'));
      }
    });
  },

  /**
   * Gets ALL items from database
   * @param {Object} req - request object
   * @param {Object} query - query object
   */
  getAllItems(model) {
    return new Promise(async (resolve, reject) => {
      try {
        resolve({
          ok: true,
          payload: await model.scope('populate').findAll(),
        });
      } catch (err) {
        reject(buildErrObject(422, err.message));
      }
    });
  },

  /**
   * Gets items from database
   * @param {Object} req - request object
   * @param {Object} query - query object
   */
  async getItems(req, model, query) {
    const options = await listInitOptions(req);
    for (const key in options) {
      if (options.hasOwnProperty(key)) {
        if (query.hasOwnProperty(key)) delete query[key];
      }
    }
    return new Promise(async (resolve, reject) => {
      try {
        resolve({
          ok: true,
          payload: await model.scope('populate').findAll({
            where: query,
            order: options.sort,
          }),
        });
      } catch (err) {
        reject(buildErrObject(422, err.message));
      }
    });
  },
  /**
   * Gets aggregated items from database
   * @param {Object} req - request object
   * @param {Object} query - query object
   */
  async getAggregatedItems(req, model, aggregated) {
    const options = await listInitOptions(req);
    return new Promise((resolve, reject) => {
      model.aggregatePaginate(aggregated, options, (err, items) => {
        if (err) {
          reject(buildErrObject(422, err.message));
        } else {
          resolve({ ok: true, ...cleanPaginationID(items) });
        }
      });
    });
  },

  /**
   * Gets item from database by id
   * @param {string} id - item id
   */
  getItem(id, model) {
    return new Promise(async (resolve, reject) => {
      let payload = await model.scope('populate').findOne({ where: { id } });
      itemNotFound(null, payload, reject, 'NOT_FOUND');
      resolve({ ok: true, payload });
    });
  },
  /**
   * Gets item from database by custom fields
   * @param {object} fields - fields
   */
  async filterItems(fields, model) {
    return new Promise((resolve, reject) => {
      model.find(fields, (err, payload) => {
        if (err) {
          reject(buildErrObject(422, err.message));
        }
        resolve({ ok: true, payload });
      });
    });
  },

  /**
   * Creates a new item in database
   * @param {Object} req - request object
   */
  createItem(body, model) {
    return new Promise(async (resolve, reject) => {
      try {
        const item = await model.create(body);
        resolve({ ok: true, payload: item });
      } catch (error) {
        reject(buildErrObject(422, err.message));
      }
    });
  },

  /**
   * Updates an item in database by id
   * @param {string} id - item id
   * @param {Object} req - request object
   */
  updateItem(id, model, body) {
    return new Promise(async (resolve, reject) => {
      try {
        let item = await model.findOne({ where: { id } });
        if (!item) {
          return itemNotFound(null, item, reject, 'NOT_FOUND');
        }
        let newItem = await item.update(body);
        resolve({ ok: true, payload: newItem });
      } catch (err) {
        reject(buildErrObject(422, err.message));
      }
    });
  },

  /**
   * Deletes an item from database by id
   * @param {string} id - id of item
   */
  deleteItem(id, model) {
    return new Promise(async (resolve, reject) => {
      try {
        let item = await model.findOne({ where: { id } });
        if (!item) return itemNotFound(null, item, reject, 'NOT_FOUND');
        await model.destroy({ where: { id } });
        resolve({ ok: true, payload: item });
      } catch (err) {
        reject(buildErrObject(422, err.message));
      }
    });
  },
};
