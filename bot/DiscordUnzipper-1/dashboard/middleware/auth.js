/**
 * Authentication middleware for the Discord Bot Admin Dashboard
 */

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  
  // If not authenticated, redirect to login page
  req.flash('error_msg', 'Please log in to access this page');
  res.redirect('/login');
}

// Middleware to check if user is an admin
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  
  // If not an admin, redirect to dashboard if authenticated
  if (req.isAuthenticated()) {
    req.flash('error_msg', 'Access denied. Admin privileges required');
    return res.redirect('/dashboard');
  }
  
  // If not authenticated, redirect to login
  req.flash('error_msg', 'Please log in to access this page');
  res.redirect('/login');
}

module.exports = {
  ensureAuthenticated,
  ensureAdmin
};