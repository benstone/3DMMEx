cmake_minimum_required(VERSION 3.22)
project(3DMMEx LANGUAGES CXX C VERSION 0.4.0)

list(APPEND CMAKE_MODULE_PATH "${PROJECT_SOURCE_DIR}/cmake")

set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:DebugDLL>")
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION_RELWITHDEBINFO TRUE)

if(MSVC)
  #set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /W4")
  
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /permissive-")

  if ("${CMAKE_CXX_COMPILER_ID}" STREQUAL "Clang")
    # Compiling with ClangCL

    # FUTURE: Fix dangling-else warnings
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /clang:-Wno-dangling-else")

    # Disable SafeSEH: required to link BRender
    # TODO: fix FindBRender to set this correctly when compiling with ClangCL
    set(CMAKE_EXE_LINKER_FLAGS "/SAFESEH:NO")
  else()
    # Generate debug information for Edit and Continue / Hot Reload
    string(REPLACE "/Zi" "/ZI" CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG}")
    string(REPLACE "/Zi" "/ZI" CMAKE_C_FLAGS_DEBUG "${CMAKE_C_FLAGS_DEBUG}")

    # Remove unused functions from release binary
    set(CMAKE_EXE_LINKER_FLAGS_RELWITHDEBINFO "${CMAKE_EXE_LINKER_FLAGS_RELWITHDEBINFO} /OPT:REF")
  endif()
endif()

include(CMakeDependentOption)
include(FetchContent)
include(TargetChompSources)

# Options
option(BUILD_PACKAGES "Build packages for 3DMM" ON)

cmake_dependent_option(3DMM_PACKAGE_WIX "Generate an MSI via WiX" ON "BUILD_PACKAGES AND DEFINED ENV{WIX}" OFF)
cmake_dependent_option(3DMM_PACKAGE_ZIP "Generate a portable ZIP" ON "BUILD_PACKAGES" OFF)

set(3DMM_PRECOMPILED_CHUNKY_PATH "" CACHE PATH "Use pre-compiled chunky files")
if (3DMM_PRECOMPILED_CHUNKY_PATH)
    if (IS_DIRECTORY "${3DMM_PRECOMPILED_CHUNKY_PATH}")
        message("Using precompiled chunky files: ${3DMM_PRECOMPILED_CHUNKY_PATH}")
    else()
        message(FATAL_ERROR "Precompiled chunky path not found: ${3DMM_PRECOMPILED_CHUNKY_PATH}")
    endif()
endif()

if (MSVC AND CMAKE_SIZEOF_VOID_P EQUAL 4)
  set(3DMM_BRENDER_LIBRARY_DEFAULT "Original")
else()
  set(3DMM_BRENDER_LIBRARY_DEFAULT "Source")
endif()

set(3DMM_BRENDER_LIBRARY "${3DMM_BRENDER_LIBRARY_DEFAULT}" CACHE STRING "Argonaut BRender library to use for rendering 3D images")
set_property(CACHE 3DMM_BRENDER_LIBRARY PROPERTY STRINGS "Original" "Source")

if (CMAKE_SYSTEM_NAME STREQUAL "Windows")
    # AudioMan is only supported on Windows
    set(3DMM_AUDIOMAN_LIBRARY "Decompilation" CACHE STRING "AudioMan library to use for mixing wave sounds")
    set_property(CACHE 3DMM_AUDIOMAN_LIBRARY PROPERTY STRINGS "Original" "Decompilation" "None")
else()
    set(3DMM_AUDIOMAN_LIBRARY "None")
endif()

# Default to Win32 on Windows, and SDL on other platforms.
if (CMAKE_SYSTEM_NAME STREQUAL "Windows")
    set(3DMM_GUI_DEFAULT "Win32")
else()
    set(3DMM_GUI_DEFAULT "SDL")
endif()

# Configure GUI library
set(3DMM_GUI "${3DMM_GUI_DEFAULT}" CACHE STRING "GUI library to use for graphics")
set_property(CACHE 3DMM_GUI PROPERTY STRINGS "Win32" "SDL")

if ("${3DMM_GUI}" STREQUAL "Win32")

    if (NOT CMAKE_SYSTEM_NAME STREQUAL "Windows")
        message(FATAL_ERROR "Win32 GUI only supported when compiling for Windows")
    endif()

elseif("${3DMM_GUI}" STREQUAL "SDL")

    message(WARNING "SDL support does not work yet!")

    if (WIN32)
        include(FetchSDL2)
    endif()

    find_package(SDL2 CONFIG REQUIRED)
    find_package(SDL2_ttf CONFIG REQUIRED)

endif()

# Optional Tools
find_package(ClangTidy)
find_package(CCache)

if (TARGET CCache::CCache AND NOT CMAKE_CXX_COMPILER_LAUNCHER)
  get_property(CMAKE_CXX_COMPILER_LAUNCHER TARGET CCache::CCache PROPERTY IMPORTED_LOCATION)
  get_property(CMAKE_C_COMPILER_LAUNCHER TARGET CCache::CCache PROPERTY IMPORTED_LOCATION)
endif()

# TODO: Enable this when the 
#if (TARGET Clang::Tidy AND NOT CMAKE_CXX_CLANG_TIDY)
#  get_property(CMAKE_CXX_CLANG_TIDY TARGET Clang::Tidy PROPERTY IMPORTED_LOCATION)
#endif()

# Local Tooling
add_compile_definitions(
  $<$<PLATFORM_ID:Windows>:WIN>
  $<$<CONFIG:Debug>:DEBUG>
)

option(ENABLE_ASM_X86 "Use original optimized assembly for Intel x86" OFF)
if (ENABLE_ASM_X86)
    add_compile_definitions(IN_80386)
endif()

if (CMAKE_C_BYTE_ORDER MATCHES LITTLE_ENDIAN)
    add_compile_definitions ("LITTLE_ENDIAN")
endif()

option(3DMM_UNICODE "Enable Unicode" OFF)
if (3DMM_UNICODE)
    add_compile_definitions(
        UNICODE
        _UNICODE
    )
endif()

# Configure version header
execute_process(
  COMMAND git describe --tags --always
  WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
  OUTPUT_VARIABLE GIT_VERSION
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
configure_file(
  "${PROJECT_SOURCE_DIR}/inc/version.h.in"
  "${PROJECT_BINARY_DIR}/inc/version.h"
)

# Select BRender library
if ("${3DMM_BRENDER_LIBRARY}" STREQUAL "Original")

    # Use original static libraries
    find_package(BRender REQUIRED)

elseif("${3DMM_BRENDER_LIBRARY}" STREQUAL "Source")

    message("Building BRender from source")

    FetchContent_Declare(
        3DMM-BRender
        GIT_REPOSITORY https://github.com/mcayland/3DMM-BRender
        GIT_TAG fix/3dmm-actor-rendering
    )

    set(BRENDER_ASAN OFF)
    FetchContent_MakeAvailable(3DMM-BRender)

    add_library(brender INTERFACE)
    target_link_libraries(
        brender
        INTERFACE
        FW ZB FMT STD
    )
    target_include_directories(
        brender
        INTERFACE
        "${BRender_SOURCE_DIR}/INC"
    )
    add_library(BRender::Libraries ALIAS brender)
else()
    message(FATAL_ERROR "Invalid BRender library selected: ${3DMM_BRENDER_LIBRARY}")
endif()

# Select AudioMan library
if ("${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "Original")

    # Use original static library
    find_package(AudioMan REQUIRED)

elseif("${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "Decompilation")

    # Use decompiled AudioMan
    FetchContent_Declare(
        AudioManDecomp
        GIT_REPOSITORY https://github.com/benstone/audioman-decomp
        GIT_TAG main
    )

    set(AUDIOMAN_BUILD_DEMO_APPS OFF)
    set(AUDIOMAN_USE_DEBUG_ALLOCATOR OFF)
    FetchContent_MakeAvailable(AudioManDecomp)
    add_library(3DMMForever::AudioMan ALIAS AudioMan)

elseif("${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "None")
    # No AudioMan
else()
    message(FATAL_ERROR "Invalid AudioMan library selected: ${3DMM_AUDIOMAN_LIBRARY}")
endif()

if (NOT "${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "None")
    add_compile_definitions(HAS_AUDIOMAN)
endif()

option(BUILD_TESTS "Enable building tests" ON)
if (BUILD_TESTS)
    enable_testing()
    include(FetchGoogleTest)
    include(GoogleTest)
    add_custom_target(tests)
endif()

add_subdirectory(kauai)

add_subdirectory(src)


# CPack must be included *last*, which is antithetical to how most CMake
# Modules work. We can set all variables for all packaging regardless of
# whether they're supported. This way we can just swap out what is added to
# `CPACK_GENERATOR`

# DO NOT CHANGE THIS. EVER. Generated manually via uuidgen. This needs to be
# the same so that user's can automatically upgrade via MSI
set(CPACK_WIX_UPGRADE_GUID 34ffdec3-60c4-4578-9cff-3e45cbc9ab0c)
# Change this as needed.
set(CPACK_WIX_PROPERTY_ARPURLINFOABOUT https://github.com/benstone/3DMMEx)

if (BUILD_PACKAGES)
  add_custom_target(dist DEPENDS $<TARGET_NAME_IF_EXISTS:package>)
  foreach (generator IN ITEMS ZIP WIX)
    if (3DMM_PACKAGE_${generator})
      list(APPEND CPACK_GENERATOR ${generator})
    endif()
  endforeach()
  include(CPack)
endif()
