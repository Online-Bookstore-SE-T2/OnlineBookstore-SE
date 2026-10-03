// Shapes documents for API responses: exposes `id` instead of `_id`, drops `__v`
// and removes any field listed in `hide` so internal or secret fields never leave the server.
function toJSONPlugin(schema, { hide = [] } = {}) {
  schema.set('toJSON', {
    versionKey: false,
    transform(_doc, ret) {
      if (ret._id) {
        ret.id = ret._id.toString();
        delete ret._id;
      }
      hide.forEach((field) => delete ret[field]);
      return ret;
    },
  });
}

module.exports = { toJSONPlugin };
