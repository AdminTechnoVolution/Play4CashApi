const { ERROR_BAD_REQUEST_RESPONSE } = require('../../shared/util/constants');
const { 
  loginUser: serviceLoginUser,
  refreshTokenUser: serviceRefreshTokenUser,
  logoutUser: serviceLogoutUser
 } = require('../services/auth.service');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');

const loginUser = async (req, res, next) => {
  try {
    if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);

    let jsonResponse = await serviceLoginUser(req);
    res.status(200).json(jsonResponse);
  } catch (err) {
    next(err);
  }
};

const refreshTokenUser = async (req, res, next) => {
  try {
    if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);

    let jsonResponse = await serviceRefreshTokenUser(req);
    res.status(200).json(jsonResponse);
  } catch (err) {
    next(err);
  }
};

const logoutUser = async (req, res, next) => {
  try {
    if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);

    let jsonResponse = await serviceLogoutUser(req);
    res.status(200).json(jsonResponse);
  } catch (err) {
    next(err);
  }
};

module.exports = { loginUser, refreshTokenUser, logoutUser };