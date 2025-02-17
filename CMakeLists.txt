cmake_minimum_required(VERSION 3.22)
project(3DMMEx LANGUAGES CXX C VERSION 0.3.0)

list(APPEND CMAKE_MODULE_PATH "${PROJECT_SOURCE_DIR}/cmake")

set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:DebugDLL>")
set(CMAKE_CXX_STANDARD 17)

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
  endif()
endif()

include(CMakeDependentOption)
include(FetchContent)
include(TargetChompSources)

enable_testing()
find_package(GTest CONFIG REQUIRED)
include(GoogleTest)

find_package(BRender REQUIRED)

# Options
option(BUILD_PACKAGES "Build packages for 3DMM" ON)

cmake_dependent_option(3DMM_PACKAGE_WIX "Generate an MSI via WiX" ON "BUILD_PACKAGES AND DEFINED ENV{WIX}" OFF)
cmake_dependent_option(3DMM_PACKAGE_ZIP "Generate a portable ZIP" ON "BUILD_PACKAGES" OFF)



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

    find_package(SDL2 CONFIG REQUIRED)
    find_package(SDL2_ttf CONFIG REQUIRED)

endif()


set(3DMM_AUDIOMAN_LIBRARY "Decompilation" CACHE STRING "AudioMan library to use for mixing wave sounds")
set_property(CACHE 3DMM_AUDIOMAN_LIBRARY PROPERTY STRINGS "Original" "Decompilation" "Stub")

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


if (NOT CMAKE_SIZEOF_VOID_P EQUAL 4)
  message(FATAL_ERROR "Cannot compile for 64-bit yet")
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

# Select AudioMan library
if ("${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "Original")

    # Use original static library
    find_package(AudioMan)

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

elseif("${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "Stub")

    # Use stub library
    add_library(audioman)
    add_library(3DMMForever::AudioMan ALIAS audioman)
    target_include_directories(audioman PUBLIC
        "${PROJECT_SOURCE_DIR}/kauai/src"
    )
    target_sources(audioman PRIVATE
        "${PROJECT_SOURCE_DIR}/audioman/audioman.cpp"
    )

else()
    message(FATAL_ERROR "Invalid AudioMan library selected: ${3DMM_AUDIOMAN_LIBRARY}")
endif()


add_subdirectory(kauai)

# TODO: Remove if() when SDL port is more stable
if (3DMM_GUI STREQUAL "Win32")

add_subdirectory(src)


# Please pay attention to the ending / in each DIRECTORY declaration. It
# affects the destination!
install(TARGETS studio RUNTIME DESTINATION .)
# HACK(bruxisma): This is due to UTEST.CHT not generating 3DMOVIE.CHK
#                 Renaming it to 3DMOVIE.CHT would resolve this.
install(FILES $<FILTER:$<TARGET_PROPERTY:studio,CHOMPED_CHUNKS>,EXCLUDE,.+utest[.]chk$>
  DESTINATION "Microsoft Kids/3D Movie Maker")
install(FILES $<FILTER:$<TARGET_PROPERTY:studio,CHOMPED_CHUNKS>,INCLUDE,.+utest[.]chk$>
  RENAME 3dmovie.chk
  DESTINATION "Microsoft Kids/3D Movie Maker")
install(FILES $<TARGET_PROPERTY:studio,3DMM_PROJECTS>
  DESTINATION "Microsoft Kids/Users/Melanie")
install(FILES $<TARGET_PROPERTY:studio,3DMM_SAMPLES>
  DESTINATION "Microsoft Kids/Users/McZee")
install(DIRECTORY "${PROJECT_SOURCE_DIR}/content-files/"
  DESTINATION "Microsoft Kids/3D Movie Maker")

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

endif()