<?php

/**
 * Create a RAPP directory, and populate it with:
 *      /src dir (copy source files)
 *      /src/build dir (used later for compilation)
 *      /extra (other optional files - non executable and non compilable)
 *
 * @param $rapp_name is the base package name
 * @param $version is current (integer) version
 * @param $arch is the current cpu architecture (@note arch may be: `i386`, `amd64`, `arm`, or `generic` - used by js and py)
 * @param $cmake defines if a CMakeLists.txt should be touched for cpp compiling/linking
 *
 * @version 1
 * @author Alex Giokas <a.gkiokas@ortelio.co.uk>
 * @date 7-11-2014
 * @copyright Ortelio ltd
 *
 * @warning method assumes CWD to be "/rapp-store/userdir"
 */
function rapp_dir_create ( $rapp_name, $version, $arch )
{
    if ( empty($rapp_name) || empty($version) || empty($arch) )
        throw new Exception( "rapp_dir_create null param" );

    $ref_dir = getcwd();

    // Calculate base dir via ref_dir + rapp_name + version + arch
    $rapp_dir = $rapp_name . "-" . $version . "_" . $arch;
    $base_dir = $ref_dir . "/" . $rapp_dir;
    $dirs = array( $base_dir, $base_dir . "/src", $base_dir . "/src/build", $base_dir . "/extra" );

    foreach ( $dirs as &$value )
    {
        // WARNING Take care of the umask used - it should allow only read/write to apache2 & gcc/ld
        if ( !mkdir ( $value, 0777, true ) )
            error_log('Failed to create dir: ' . $value );
    }

    // Return local reference to the newly created rapp_dir
    return $rapp_dir;
}


/**
 * Populate @param rapp_dir and @param subdir (e.g., /src, /includes) using as source the files found in the array
 * 
 * @version 1
 * @date 6-11-2014
 * @author Alex Giokas <a.gkiokas@ortelio.co.uk>
 * @copyright Ortelio Ltd
 *
 * @warning method assumes CWD to be "/rapp-store/userdir"
 */
function rapp_dir_populate ( array $files, $rapp_dir, $subdir )
{
    if ( empty($files) || empty($rapp_dir) || empty($subdir) )
        throw new Exception( "rapp_dir_populate null param" );
    
    $ref_dir = getcwd();
    $target_dir = $ref_dir . "/" . $rapp_dir . "/" . $subdir;

    foreach ( $files as $filepath )
    {
        // get basename from filepath
        $file = basename( $filepath );
        
        // calculate new target
        $target = $target_dir . "/" . $file;
        
        // Try to copy
        if ( !copy( $filepath, $target ) ) 
            error_log( "failed to copy $file\r\nfrom $filepath\r\nto $target\r\n" );
    }
}


/// Change directory into "/rapp-store/userdir" from "/rapp-store/php"
function cd_to_userdir( )
{
    chdir( "../" );
    $cwd = getcwd();
    return chdir( $cwd . "/userdir/" );
}

?>