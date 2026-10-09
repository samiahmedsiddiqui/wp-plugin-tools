<?php
/**
 * Basic checks for the plugin's metadata.
 *
 * @package {{name}}
 */

/**
 * Plugin metadata tests.
 */
class Test_Plugin extends WP_UnitTestCase {

	/**
	 * The plugin header and readme.txt agree on the version.
	 */
	public function test_header_version_matches_stable_tag() {
		$root = dirname( __DIR__ );

		$header = get_file_data( "{$root}/{{mainFile}}", array( 'version' => 'Version' ) );
		$readme = get_file_data( "{$root}/readme.txt", array( 'stable' => 'Stable tag' ) );

		$this->assertSame( $readme['stable'], $header['version'] );
	}
}
