const express = require('express');
const router = express.Router();
const authToken = require('../lib/auth-token');
const helpers = require('../lib/helpers');
const User = require('../models/user');
const Driver = require('../models/driver');
const Organization = require('../models/organization');
const ServiceType = require('../models/service_type');
const Vehicle = require('../models/vehicle');
const Trip = require('../models/trip');
const BlackList = require('../models/blacklist');
const firebase = require('../firebase');
const DriversView = require('../models/drivers_view')
const fs = require('fs');
const { upload } = require('../multer');
const driverValidation = require('../validations/models/driver');
const SHA256 = require('crypto-js/sha256');

// User routes

router.get('/users', helpers.requireAdminAuthentication, async (req, res, next) => {
  const {page} = req.query;
  const users = await new User().orderBy('id', 'ASC').fetchPage({pageSize: 15, page});
  const {pageCount} = users.pagination;
  res.status(200).json({users: users.toJSON(), pageCount});
});

router.get('/user/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const user_id = req.params.id;
  const user = await new User({id: user_id}).fetch();
  if (user) {
    res.status(200).json(user.toJSON());
  }
  else {
    res.status(404).json({errors: ['Este Usuario no existe']});
  }
});

router.put('/user/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const user_id = req.params.id;
  let user = await new User({id: user_id}).fetch();
  if(user) {
    user = await user.save(req.body, {patch: true});
    res.status(200).json(user.toJSON());
  }
  else {
    res.status(404).json({errors: ['Este Usuario no existe']});
  }
});

router.delete('/user/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const user_id = req.params.id;
  let user = await new User({id: user_id}).fetch();
  if(user) {
    try {
      user = await user.destroy();
      res.status(200).json({flash: ['Usuario eliminado exitosamente']});
    }
    catch (error){
      switch (error.code){
        case '23503':
        res.status(400).json({errors: ['Este Usuario esta referenciado en otra tabla']});
        break;
      }
    }
  }
  else {
    res.status(404).json({errors: ['Este Usuario no existe']});
  }
});

router.get('/users-search', helpers.requireAdminAuthentication, async (req, res, next) => {
  const search = `%${req.query.search}%`
  const page = req.query.page;
  User.query(function(qb) {
    qb.where('email', 'ILIKE', search)
      .orWhere('full_name', 'ILIKE', search)
      .orWhere('phone_number', 'ILIKE', search)
  }).fetchPage({pageSize: 15, page})
  .then(function(User){
      const {pageCount} = User.pagination
      res.status(200).json({users: User.toJSON(), pageCount});
    })
    .catch(err => {
      res.status(404).json(err);
    })
})

// Driver routes

router.get('/drivers', helpers.requireAdminAuthentication, async (req, res, next) => {
  const {page} = req.query;
  const drivers = await new DriversView().orderBy('id', 'DESC').fetchPage({withRelated: ['vehicle.organization', 'user'], pageSize: 15, page});
  const {pageCount} = drivers.pagination;
  res.status(200).json({drivers: drivers.toJSON(), pageCount});
});


router.post('/new_driver', helpers.requireAdminAuthentication, upload.single('public_service_permission_image'), driverValidation.validate, async (req, res, next) => {
  const public_service_permission_image = req.file.path
  const {
    full_name,
    email,
    password,
    license_number,
    status = 'free',
    phone_number,
  } = req.body;

  let password_hash = SHA256(password).toString();

  let user = await new User({ full_name, email, password_hash }).save();
  if (user) {
    let user_id = user.get('id');
    let driver = await new Driver({
      license_number,
      status,
      user_id,
      phone_number,
      public_service_permission_image
    }).save();
    if (driver){
      driver = await driver.fetch({withRelated: ['vehicle', 'user']});
      driver = driver.toJSON();
      const token = authToken.encode({
        id: driver.user.id,
        driver_id: driver.id,
        role: 'driver'
      });
      res.status(201).json({ jwt: token });
    }
    else{
      user = await new User({id: user_id}).destroy();
      res.status(422).json({errors: [ 'No se pudo crear el conductor']});
    }
  }
  else
    res.status(422).json({errors: [ 'No se pudo crear el conductor']});
});

router.get('/driver/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  let driver = await new Driver({id: req.params.id}).fetch();
  driver = driver.toJSON()
  let user = await new User({id: driver.user_id}).fetch();
  user = user.toJSON();

  driver.email = user.email
  driver.full_name = user.full_name

  if (driver) {
    res.status(200).json(driver);
  }
  else {
    res.status(404).json({errors: ['Este Conductor no existe']});
  }
});

router.put('/driver/:id', helpers.requireAdminAuthentication, upload.single('public_service_permission_image'), async (req, res, next) => {
  const driver_id = req.params.id;
  let driver = await new Driver({id: driver_id}).fetch();
  let user = await new User({id: driver.toJSON().user_id}).fetch();

  if(driver) {
    const { phone_number, license_number, email, full_name } = req.body
    if (req.file){
      const public_service_permission_image = req.file.path
      const oldNamePermissionImage = driver.toJSON().public_service_permission_image
      driver = await driver.save({phone_number, license_number, public_service_permission_image}, {patch: true});
      fs.unlinkSync(oldNamePermissionImage)
    }else{
      driver = await driver.save({phone_number, license_number}, {patch: true});
    }
    user = await user.save({email, full_name}, {path: true})
    res.status(200).json(driver.toJSON());
  }
  else {
    res.status(404).json({errors: ['Este Conductor no existe']});
  }
});

router.delete('/driver/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const driver_id = req.params.id;
  let driver = await new Driver({id: driver_id}).fetch();
  if(driver) {
    try {
      driver = await driver.destroy();
      res.status(200).json({flash: ['Conductor eliminado exitosamente']});
    }
    catch (error){
      switch (error.code){
        case '23503':
        res.status(400).json({errors: ['Este Conductor esta referenciado en otra tabla']});
        break;
      }
    }
  }
  else {
    res.status(404).json({errors: ['Este Conductor no existe']});
  }
});

router.put('/driver/:id/activate', async (req, res, next) => {
  const driver_id = req.params.id;
  let driver = await new Driver({id: driver_id}).fetch({ withRelated: ['user'] });
  if (driver) {
    const active = driver.toJSON().active;
    driver = await driver.save({ active: !active }, {patch: true});
    const driverJSON = driver.toJSON();
    if (driverJSON.active == !active) {
      if (driverJSON.active == true && driverJSON.user.device_id) {
        res.sendPushNotification({
          token: driverJSON.user.device_id,
          title: 'Tu cuenta ha sido activada',
          body: 'Ya puedes tomar servicios!!'
        });
      }
      res.status(200).json(driverJSON);
    }
    else {
      res.status(422).json({errors: ['El status del Conductor no pudo ser cambiado']});
    }
  }
  else {
    res.status(404).json({errors: ['Este Conductor no existe']});
  }
});

router.post('/driver/:id/notify', helpers.requireAdminAuthentication, async (req, res, next) => {
  const driver_id = req.params.id;
  const { title, body } = req.body;
  let driver = await new Driver({id: driver_id}).fetch({ withRelated: ['user'] });
  if (driver) {
    let driverJSON = driver.toJSON();
    res.sendPushNotification({
      token: driverJSON.user.device_id,
      title: title,
      body: body
    });
    res.status(200).json(driverJSON);
  }
  else {
    res.status(404).json({errors: ['Este Conductor no existe']});
  }
});

router.get('/drivers-search', helpers.requireAdminAuthentication, async (req, res, next) => {
  const search = `%${req.query.search}%`
  const page = req.query.page;
  DriversView.query(function(qb) {
    qb.where('email', 'ILIKE', search)
      .orWhere('full_name', 'ILIKE', search)
      .orWhere('phone_number', 'ILIKE', search)
      .orWhere('license_number', 'ILIKE', search)
  })
  .fetchPage({pageSize: 15, page})
  .then(function(DriversView){
    const {pageCount} = DriversView.pagination
    res.status(200).json({drivers: DriversView.toJSON(), pageCount});
  })
  .catch(err => {
    res.status(404).json(err);
  });
})

// Organization routes

router.get('/organizations', helpers.requireAdminAuthentication, async (req, res, next) => {
  const {page} = req.query;
  const organizations = await new Organization().orderBy('id', 'DESC').fetchPage({pageSize: 10, page});
  const {pageCount} = organizations.pagination;
  res.status(200).json({organizations: organizations.toJSON(), pageCount});
})

router.post('/organizations', helpers.requireAdminAuthentication, async (req, res, next) => {
  const name = req.query.name
  const organization = await new Organization({ name }).save();
  if (organization){
    res.status(201).json(organization.toJSON());
  }else{
    res.status(422).json({errors: ['No se pudo crear la Organización']});
  }
});

router.get('/organization/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const organization_id = req.params.id;
  const organization = await new Organization({id: organization_id}).fetch();
  if (organization) {
    res.status(200).json(organization.toJSON());
  }
  else {
    res.status(404).json({errors: ['Esta Organización no existe']});
  }
});

router.put('/organization/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const organization_id = req.params.id;
  let organization = await new Organization({id: organization_id}).fetch();
  if (organization) {
    organization = await organization.save(req.body, {patch: true});
    res.status(200).json(organization.toJSON());
  }
  else {
    res.status(404).json({errors: ['Esta Organización no existe']});
  }
});

router.delete('/organization/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const organization_id = req.params.id
  let organization = await new Organization({id: organization_id}).fetch();
  if (organization){
    try {
      organization = await new Organization({id: organization_id}).destroy();
      res.status(200).json({flash: ['Organizción elimnada con exito']});
    }
    catch(error) {
      switch (error.code){
        case '23503':
        res.status(400).json({errors: ['Esta Organización esta referenciada en otra tabla']});
        break;
      }
    }
  }
  else
    res.status(404).json({errors: ['Esta Organización no existe']});
});

//Service_types_routes

router.get('/services', helpers.requireAdminAuthentication, async (req, res, next) => {
  const {page} = req.query;
  const services = await new ServiceType().orderBy('id', 'ASC').fetchPage({pageSize: 15, page});
  const {pageCount} = services.pagination;
  res.status(200).json({services: services.toJSON(), pageCount});
});

router.post('/services', helpers.requireAdminAuthentication, async (req, res, next) => {
  const name = req.body.name;
  const service = await new ServiceType({ name }).save();
  if (service)
    res.status(201).json(service.toJSON());
  else
    res.status(422).json({errors: ['No se pudo crear el Servicio']});
});

router.get('/service/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const service_id = req.params.id;
  let service = await new ServiceType({id: service_id}).fetch();
  if (service) {
    res.status(200).json(service.toJSON());
  }
  else {
    res.status(422).json({errors: ['Este Servicio no existe']});
  }
});

router.put('/service/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const service_id = req.params.id;
  let service = await new ServiceType({id: service_id}).fetch();
  if (service) {
    service = await service.save(req.body, {patch: true});
    res.status(200).json(service.toJSON());
  }
  else {
    res.status(422).json({errors: ['Este Servicio no existe']});
  }
});

router.delete('/service/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const service_id = req.params.id;
  let service = await new ServiceType({id: service_id}).fetch();
  if (service) {
    try {
      service = await service.destroy();
      res.status(200).json({flash: ['Servicio eliminado con exito']});
    }
    catch(error) {
      switch (error.code){
        case '23503':
        res.status(400).json({errors: ['Esta Servicio esta referenciada en otra tabla']});
        break;
      }
    }
  }
});

// Vehicles routes

router.get('/vehicles', helpers.requireAdminAuthentication, async (req, res, next) => {
  const {page} = req.query;
  const vehicles = await new Vehicle().orderBy('id', 'ASC').fetchPage({pageSize: 15, page});
  const {pageCount} = vehicles.pagination;
  res.status(200).json({vehicles: vehicles.toJSON(), pageCount});
});

router.get('/vehicle/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const vehicle_id = req.params.id;
  const vehicle = await new Vehicle({id: vehicle_id}).fetch();
  if (vehicle) {
    res.status(200).json(vehicle.toJSON());
  }
  else {
    res.status(404).json({errrors: ['Este Vehiculo no existe']});
  }
});

router.post('/vehicles', helpers.requireAdminAuthentication, async (req, res, next) => {
  try {
    const vehicle = await new Vehicle(req.body).save();
    res.status(201).json(vehicle.toJSON());
  }
  catch(error) {
    res.status(400).json({errors: ['No se puede guardar el Vehiculo'], error_code: error.code});
  }
});

router.put('/vehicle/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const vehicle_id = req.params.id;
  let vehicle = await new Vehicle({id: vehicle_id}).fetch();
  if (vehicle) {
    try {
      vehicle = await vehicle.save(req.body, {patch: true})
      res.status(201).json(vehicle.toJSON());
    }
    catch(error) {
      res.status(400).json({errors: ['No se puede actualizar el Vehiculo'], error_code: error.code});
    }
  }
  else {
    res.status(404).json({errors: ['Este Vehiculo no existe']});
  }
});

router.delete('/vehicle/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const vehicle_id = req.params.id;
  let vehicle = await new Vehicle({id: vehicle_id}).fetch();
  if (vehicle) {
    try {
      vehicle = await vehicle.destroy()
      res.status(201).json({flash: ['Vehiculo eliminado con exito']});
    }
    catch(error) {
      switch (error.code){
        case '23503':
        res.status(400).json({errors: ['Este Vehiculo esta referenciado en otra tabla']});
        break;
      }
    }
  }
  else {
    res.status(404).json({errors: ['Este Vehiculo no existe']});
  }
});

// Trips routes

router.get('/trips', helpers.requireAdminAuthentication, async (req, res, next) => {
  const { page, status } = req.query;
  const trips = await new Trip()
    .where({ status: status })
    .orderBy('id', 'DESC')
    .fetchPage({
      pageSize: 15,
      page,
      withRelated: ['user', 'driver.user']
    });
  const { pageCount } = trips.pagination;
  res.status(200).json({ trips: trips.toJSON(), pageCount});
});

router.get('/trip/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const trip_id = req.params.id;
  const trip = await new Trip({id: trip_id}).fetch();
  if (trip) {
    res.status(200).json(trip.toJSON());
  }
  else {
    res.status(404).json({errrors: ['Este Viaje no existe']});
  }
});

router.post('/trips', helpers.requireAdminAuthentication, async (req, res, next) => {
  try {
    const trip = await new Trip(req.body).save();

    res.status(201).json(trip.toJSON());
  }
  catch(error) {
    res.status(400).json({errors: ['No se puede guardar el Viaje'], error_code: error.code});
  }
});

router.put('/trip/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const trip_id = req.params.id;
  let trip = await new Trip({id: trip_id}).fetch();
  if (trip) {
    try {
      trip = await trip.save(req.body, {patch: true})
      res.status(201).json(trip.toJSON());
    }
    catch(error) {
      res.status(400).json({errors: ['No se puede actualizar el Viaje'], error_code: error.code});
    }
  }
  else {
    res.status(404).json({errors: ['Este Viaje no existe']});
  }
});

router.delete('/trip/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const trip_id = req.params.id;
  let trip = await new Trip({id: trip_id}).fetch();
  if (trip) {
    try {
      trip = await trip.destroy();

      firebase
        .database()
        .ref('server/holding_trips/')
        .child(trip_id)
        .remove();

      firebase
        .database()
        .ref('server/taken_trips/')
        .child(trip_id)
        .remove();

      res.status(201).json({flash: ['Viaje eliminado con exito']});
    }
    catch(error) {
      switch (error.code){
        case '23503':
        res.status(400).json({errors: ['Este Viaje esta referenciado en otra tabla']});
        break;
      }
    }
  }
  else {
    res.status(404).json({errors: ['Este Viaje no existe']});
  }
});

router.put('/finish_trip/:id', helpers.requireAdminAuthentication, async (req, res, next) => {
  const trip_id = req.params.id;
  let trip = await new Trip({id: trip_id}).fetch();

  if (trip && trip.toJSON().status === 'active') {
    trip = await trip.save({status: 'finished'}, {patch: true});
    if (trip.toJSON().status == 'finished'){
      let driver = await new Driver({id: trip.toJSON().driver_id}).fetch();
      driver = await driver.save({status: 'free'}, {patch: true});
      trip = await trip.fetch({withRelated: ['user', 'driver.user','vehicle.organization']});

      firebase
        .database()
        .ref('server/taken_trips/')
        .child(trip.toJSON().id)
        .remove();

      firebase
        .database()
        .ref('server/finished_trips/')
        .child(trip.toJSON().id)
        .set(trip.toJSON());

      // res.io.in(`user-${trip.toJSON().user.id}`).emit('finishedTrip', trip.toJSON());
      res.status(200).json(trip.toJSON());
    }
    else
      res.status(422).json({errors: [ 'No se pudo actualizar el estado del Viaje' ]});
  }else {
    res.status(422).json({errors: [ 'El Conductor no puede finalizar el viaje si no lo ha iniciado' ]});
  }
});


// BlackList routes

router.get('/blacklist', async (req, res, next) => {
  const {page} = req.query;
  const blacklist = await new BlackList().fetchPage({ withRelated: ['driver'], pageSize: 15, page})
  const {pageCount} = blacklist.pagination;
  res.status(200).json({blacklist: blacklist.toJSON(), pageCount});
});

router.post('/blacklist', async (req, res, next) => {
  const {driver_id, reason = ""} = req.body
  const driver_banned = await new BlackList({driver_id, reason}).save();
  if (driver_banned){
    res.status(200).json(driver_banned.toJSON());
  }
  else {
    res.status(422).json({errors: ['No se pudo bloquear el usuario']});
  }
});

router.delete('/blacklist/:id', async (req, res, next) => {
  const blacklist_id = req.params.id;
  let blacklistItem = await new BlackList({id: blacklist_id}).fetch();
  if (blacklistItem){
    blacklistItem = await blacklistItem.destroy();
    res.status(200).json({flash: ['El Conductor ha sido eliminado del blacklist']});
  }
  else {
    res.status(422).json({errors: ['No se pudo encontrar al driver']});
  }
});

// Firebase routes

router.post('/firebase/sync', async (req, res, next) => {
  const holding_trips = await new Trip().holdingTrips();

  firebase
    .database()
    .ref('server/holding_trips/')
    .remove();

  for(const trip of holding_trips.toJSON()) {
    firebase
      .database()
      .ref('server/holding_trips/')
      .child(trip.id)
      .set({...trip, timestamp: new Date(trip.created_at).getTime()});
  }

  const taken_trips = await new Trip().takenTrips();

  firebase
    .database()
    .ref('server/taken_trips/')
    .remove();

    for(const trip of taken_trips.toJSON()) {
      firebase
        .database()
        .ref('server/taken_trips/')
        .child(trip.id)
        .set(trip);
    }

  firebase
    .database()
    .ref('server/finished_trips/')
    .remove();

  res.status(200).json({message: 'Firebase Real Time DB Updated'});
});

module.exports = router;
