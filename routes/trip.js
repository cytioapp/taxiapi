const express = require('express');
const router = express.Router();
const knex = require('../knex');
const helpers = require('../lib/helpers');
const Trip = require('../models/trip');
const Driver = require('../models/driver');
const validateTrip = require('../validations/models/trip');

router.get('/', async (req, res, next) => {
  const trips = await new Trip().fetchAll();
  res.status(200).json(trips.toJSON());
});

router.post('/',validateTrip.validate, async (req, res, next) => {
  let {
    address_origin,
    lat_origin,
    lng_origin,
    user_id
  } = req.body;

  let trip = await new Trip({
    address_origin,
    lat_origin,
    lng_origin,
    user_id
  }).save();

  let trip_id = trip.get('id');
  if (trip_id){
    trip = await new Trip({id: trip_id}).fetch({withRelated: 'user'});
    res.status(200).json(trip.toJSON());
  }
  else
    res.status(422).json({errors: {message: 'No se pudo crear el viaje'}});
});

router.put('/accept_trip/:id', async (req, res, next) => {
  let trip_id = req.params.id;
  let { driver_id} = req.body;
  let trip = await new Trip({id: trip_id}).fetch();
  let driver = await new Driver({id: driver_id}).fetch();
  trip_id = trip.get('id');
  let vehicle_id = driver.toJSON().vehicle_id;
  if (trip_id && driver_id && vehicle_id) {
    trip = await trip.save({ status: 'taken', driver_id, vehicle_id}, {patch: true});
    if (trip.toJSON().vehicle_id == vehicle_id){
      driver = await driver.save({status: 'busy'}, {patch: true});
      trip = await trip.fetch({withRelated: ['user', 'driver.user','vehicle']});
      res.status(201).json(trip.toJSON());
    }
    else
      res.status(422).json({errors: {message: 'No se pudo actualizar el trip'}});
  }
  else
    res.status(422).json({errors: {message: 'No se pudo encontrar el Viaje o el Conductor no tiene vehiculo asignado'}});
});

router.put('/start_trip/:id', (req, res, next) => {

});

router.put('/finish_trip/:id', (req, res, next) => {

});

router.put('/set_rate/:id'),(req, res, next) => {

};

router.get('/:id', async (req, res, next) => {
  const id = req.params.id;
  let trip = await new Trip({id}).fetch();
  let trip_id = trip.get('id');
  res.status(200).json(trip_id ? trip.toJSON() : {errors: {message: 'No se pudo encontrar ningun viaje'}});
});

router.delete('/:id', async (req, res, next) => {
  const id = req.params.id;
  let trip = await new Trip({id}).fetch();
  let trip_id = trip.get('id');
  if (trip_id){
    trip = await trip.destroy();
    let successMessage = {flash: {message: 'Viaje eliminado con exito'}};
    let errorMessage = {errors: {message: 'No se pudo eliminar el viaje'}};
    res.status(200).json(typeof service_id === 'undefined' ? successMessage : errorMessage);
  }
  else
    res.status(200).json({errors: {message: 'No se pudo encontrar ningun viaje'}})
});

module.exports = router;
