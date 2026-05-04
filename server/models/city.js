var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var citySchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  state_id: {
    type: Schema.Types.ObjectId,
    ref: 'States',
    required: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  created_on: {
    type: Date,
    default: Date.now
  }
});

// Cities are unique within a state, not globally — so two states can each
// have a city named "Springfield".
citySchema.index({ name: 1, state_id: 1 }, { unique: true });

module.exports = mongoose.model('City', citySchema);
