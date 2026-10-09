<?php
/**
 * Plugin Name: Fixture Plugin
 * Description: A minimal plugin used to test wp-plugin-tools.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: wp-plugin-tools
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: fixture-plugin
 *
 * @package Fixture_Plugin
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Returns the plugin's greeting.
 *
 * @return string Greeting.
 */
function fixture_plugin_greeting() {
	return __( 'Hello from the fixture plugin.', 'fixture-plugin' );
}
