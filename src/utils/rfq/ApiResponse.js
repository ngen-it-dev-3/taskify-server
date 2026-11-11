// src/utils/ApiResponse.js

class ApiResponse {
  constructor(success, message, data, meta) {
    this.success = success;
    this.message = message;
    if (data !== undefined) this.data = data;
    if (meta !== undefined) this.meta = meta;
  }

  static ok(data, message = 'Success', meta) {
    return new ApiResponse(true, message, data, meta);
  }

  static created(data, message = 'Created successfully') {
    return new ApiResponse(true, message, data);
  }

  static error(message, details) {
    return new ApiResponse(false, message, details);
  }
}

module.exports = { ApiResponse };