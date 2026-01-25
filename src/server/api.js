/**
 * REST API for Flight Data
 */

import express from 'express';
import * as db from './database.js';
import { config } from './config.js';

export function createApiRouter() {
  const router = express.Router();

  /**
   * GET /api/flights
   * Get all active flights
   * Query params:
   *   - since: timestamp to get flights updated after (optional)
   */
  router.get('/flights', (req, res) => {
    try {
      const since = req.query.since ? parseInt(req.query.since, 10) : null;

      let flights;
      if (since) {
        flights = db.getFlightsSince(since);
      } else {
        flights = db.getAllFlights();
      }

      res.json({
        success: true,
        timestamp: Date.now(),
        count: flights.length,
        flights
      });
    } catch (error) {
      console.error('Error fetching flights:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/flights/:id
   * Get a specific flight by ID
   */
  router.get('/flights/:id', (req, res) => {
    try {
      const flights = db.getAllFlights();
      const flight = flights.find(f => f.id === req.params.id);

      if (!flight) {
        return res.status(404).json({
          success: false,
          error: 'Flight not found'
        });
      }

      res.json({
        success: true,
        flight
      });
    } catch (error) {
      console.error('Error fetching flight:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/flights/:id/trail
   * Get trail history for a specific flight
   * Query params:
   *   - limit: max number of points (default: 256)
   */
  router.get('/flights/:id/trail', (req, res) => {
    try {
      const limit = Math.min(
        parseInt(req.query.limit, 10) || config.maxTrailPoints,
        config.maxTrailPoints
      );

      const trail = db.getFlightTrail(req.params.id, limit);

      res.json({
        success: true,
        flightId: req.params.id,
        count: trail.length,
        trail
      });
    } catch (error) {
      console.error('Error fetching trail:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/trails
   * Get all trails for active flights
   * Query params:
   *   - limit: max points per flight (default: 256)
   */
  router.get('/trails', (req, res) => {
    try {
      const limit = Math.min(
        parseInt(req.query.limit, 10) || config.maxTrailPoints,
        config.maxTrailPoints
      );

      const trails = db.getAllTrails(config.maxFlightAge, limit);

      res.json({
        success: true,
        timestamp: Date.now(),
        count: Object.keys(trails).length,
        trails
      });
    } catch (error) {
      console.error('Error fetching trails:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/stats
   * Get database statistics
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = db.getStats();

      res.json({
        success: true,
        timestamp: Date.now(),
        stats: {
          flightCount: stats.flightCount,
          trailPointCount: stats.trailPointCount,
          dataSource: config.dataSource,
          fetchInterval: config.fetchIntervalSeconds,
          maxTrailPoints: config.maxTrailPoints
        }
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/config
   * Get client-relevant configuration
   */
  router.get('/config', (req, res) => {
    res.json({
      success: true,
      config: {
        recommendedPollInterval: config.fetchIntervalSeconds * 1000,
        maxTrailPoints: config.maxTrailPoints,
        dataSource: config.dataSource,
        cesiumAccessToken: config.cesiumAccessToken
      }
    });
  });

  return router;
}
