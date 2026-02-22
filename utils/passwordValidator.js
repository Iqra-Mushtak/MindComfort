const passwordValidator = require('password-validator');

const schema = new passwordValidator();

schema
  .is().min(8)
  .is().max(50)
  .has().uppercase()
  .has().lowercase()
  .has().digits(1)
  .has().symbols()
  .has().not().spaces()

module.exports = schema;