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
    # Disable warnings about string literals
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /clang:-Wno-multichar /clang:-Wno-writable-strings")

    # FUTURE: Fix dangling-else warnings
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /clang:-Wno-dangling-else")

    # Disable SafeSEH: required to link BRender
    # TODO: fix FindBRender to set this correctly when compiling with ClangCL
    set(CMAKE_EXE_LINKER_FLAGS "/SAFESEH:NO")

  else()
    # permissive forces C++14 const char* as default for literals
    # this flag re-enables the auto-conversion for the microsoft compiler
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /Zc:strictStrings-")
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


if (ENABLE_ASM_X86)
    # Generate Kauai decoders for Intel x86
    add_executable(kcdc-386 EXCLUDE_FROM_ALL)
    target_sources(kcdc-386 PRIVATE "${PROJECT_SOURCE_DIR}/kauai/src/kcdc_386.c")
    target_include_directories(kcdc-386 PRIVATE $<TARGET_PROPERTY:kauai,INCLUDE_DIRECTORIES>)

    add_executable(kcd2-386 EXCLUDE_FROM_ALL)
    target_sources(kcd2-386 PRIVATE "${PROJECT_SOURCE_DIR}/kauai/src/kcd2_386.c")
    target_include_directories(kcd2-386 PRIVATE $<TARGET_PROPERTY:kauai,INCLUDE_DIRECTORIES>)

    add_custom_command(
        OUTPUT "${PROJECT_BINARY_DIR}/generated/kauai/src/kcdc_386.h"
        COMMAND cmake -E make_directory "${PROJECT_BINARY_DIR}/generated/kauai/src"
        COMMAND kcdc-386 "${PROJECT_BINARY_DIR}/generated/kauai/src/kcdc_386.h"
        COMMENT "Generating kcdc_386.h"
        VERBATIM
    )

    add_custom_command(
        OUTPUT "${PROJECT_BINARY_DIR}/generated/kauai/src/kcd2_386.h"
        COMMAND cmake -E make_directory "${PROJECT_BINARY_DIR}/generated/kauai/src"
        COMMAND kcd2-386 "${PROJECT_BINARY_DIR}/generated/kauai/src/kcd2_386.h"
        COMMENT "Generating kcd2_386.h"
        VERBATIM
    )
endif()

add_executable(chelp WIN32 EXCLUDE_FROM_ALL)
target_sources(chelp PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/chtop.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelpexp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelp.rc"
)
target_include_directories(chelp PRIVATE $<TARGET_PROPERTY:kauai,INCLUDE_DIRECTORIES>)
target_link_libraries(chelp PRIVATE $<TARGET_NAME_IF_EXISTS:kauai>)

# Kauai test applications
add_executable(ft WIN32 EXCLUDE_FROM_ALL)
target_sources(ft PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/src/test.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/ft.rc"
    "${PROJECT_SOURCE_DIR}/kauai/src/ft.cpp"
)
target_link_libraries(ft PRIVATE kauai)

add_executable(ut EXCLUDE_FROM_ALL)
target_sources(ut PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/src/ut.cpp"
)
target_link_libraries(ut PRIVATE kauai)

add_executable(chomp EXCLUDE_FROM_ALL)
target_sources(chomp PRIVATE "${PROJECT_SOURCE_DIR}/kauai/tools/chomp.cpp")
target_include_directories(chomp PRIVATE $<TARGET_PROPERTY:kauai,INCLUDE_DIRECTORIES>)
target_link_libraries(chomp PRIVATE $<TARGET_NAME_IF_EXISTS:kauai>)

# Chunk Editor
add_executable(ched WIN32 EXCLUDE_FROM_ALL)
target_sources(ched PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/ched.rc"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chdoc.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/ched.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chgrp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chhex.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chmbmp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chpic.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chtxt.cpp"
)
target_link_libraries(ched PRIVATE kauai)

# mkmbmp
add_executable(mkmbmp EXCLUDE_FROM_ALL)
target_sources(mkmbmp PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/mkmbmp.cpp"
)
target_link_libraries(mkmbmp PRIVATE kauai)

# kpack
add_executable(kpack EXCLUDE_FROM_ALL)
target_sources(kpack PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/kpack.cpp"
)
target_link_libraries(kpack PRIVATE kauai)

# chmerge
add_executable(chmerge EXCLUDE_FROM_ALL)
target_sources(chmerge PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/chmerge.cpp"
)
target_link_libraries(chmerge PRIVATE kauai)

# chelpdmp
add_executable(chelpdmp EXCLUDE_FROM_ALL)
target_sources(chelpdmp PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelpdmp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelpexp.cpp"
)
target_link_libraries(chelpdmp PRIVATE kauai)

# These are only here to ensure configure is rerun when dependencies are generated.
# This is 
file(GLOB building-chunk-sources CONFIGURE_DEPENDS "${PROJECT_SOURCE_DIR}/src/building/*.cht")
file(GLOB studio-chunk-sources CONFIGURE_DEPENDS "${PROJECT_SOURCE_DIR}/src/studio/*.cht")


add_compile_options($<$<COMPILE_LANG_AND_ID:CXX,MSVC>:/wd4430>)
add_library(kauai)
target_include_directories(
  kauai
    PUBLIC
      "${PROJECT_SOURCE_DIR}/kauai/src"
      "$<BUILD_INTERFACE:${PROJECT_BINARY_DIR}/generated/kauai/src>")

target_sources(kauai
  PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/src/appb.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/base.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/chcm.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/chse.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/chunk.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/clip.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/clok.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/cmd.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/codec.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/codkauai.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/crf.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/ctl.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/cursor.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/dlg.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/docb.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/file.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/frame.rc"
    "${PROJECT_SOURCE_DIR}/kauai/src/gfx.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/gob.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/groups.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/groups2.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/kidhelp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/kidspace.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/kidworld.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/lex.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/mbmp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/mbmpgui.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/midi.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/mididev.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/mididev2.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/mssio.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/pic.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/region.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/rtxt.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/rtxt2.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/scrcom.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/scrcomg.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/screxe.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/screxeg.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/sndam.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/sndm.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/spell.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/stream.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/text.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/textdoc.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/util.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilcopy.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilerro.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilglob.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilint.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilmem.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilrnd.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilstr.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/video.cpp"

    # Windows implementations
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/appbwin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/dlgwin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/filewin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/fniwin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/gfxwin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/memwin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/menuwin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/picwin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/gobwin.cpp>

    # Stubs for Visual C++ 2.1 CRT functions
    "${PROJECT_SOURCE_DIR}/kauai/src/stub.cpp"   
)

if (ENABLE_ASM_X86)
    target_sources(
        kauai
        PRIVATE
        "${PROJECT_BINARY_DIR}/generated/kauai/src/kcdc_386.h"
        "${PROJECT_BINARY_DIR}/generated/kauai/src/kcd2_386.h"
    )
endif()

target_compile_definitions(kauai PUBLIC
  _LPCVOID_DEFINED
  STRICT)

target_link_libraries(kauai
  PUBLIC
    3DMMForever::AudioMan
    $<$<PLATFORM_ID:Windows>:Msacm32>
    $<$<PLATFORM_ID:Windows>:Vfw32>
    $<$<PLATFORM_ID:Windows>:Winmm>
    $<$<PLATFORM_ID:Windows>:mpr>)

# Unit tests
add_executable(kauai_test
    "${PROJECT_SOURCE_DIR}/kauai/test/kauai_test.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/test/compression_test.cpp"
)
target_link_libraries(
    kauai_test
    PRIVATE
    kauai
    GTest::gtest_main
)
gtest_discover_tests(kauai_test)

add_library(brender)
target_sources(brender
    PRIVATE
    "${PROJECT_SOURCE_DIR}/bren/bwld.cpp"
    "${PROJECT_SOURCE_DIR}/bren/stderr.c"
    "${PROJECT_SOURCE_DIR}/bren/stdfile.c"
    "${PROJECT_SOURCE_DIR}/bren/stdmem.c"
    "${PROJECT_SOURCE_DIR}/bren/tmap.cpp"
    "${PROJECT_SOURCE_DIR}/bren/zbmp.cpp"
)
target_include_directories(brender PUBLIC "${PROJECT_SOURCE_DIR}/BREN/INC")
target_link_libraries(brender
  PUBLIC
    kauai
    BRender::Libraries)

add_library(engine)
target_sources(engine
    PRIVATE
    "${PROJECT_SOURCE_DIR}/src/engine/actor.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/actredit.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/actrsave.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/actrsnd.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/bkgd.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/body.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/modl.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/movie.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/msnd.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/mtrl.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/scene.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/srec.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tagl.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tagman.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tbox.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tdf.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tdt.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tmpl.cpp"
)
target_include_directories(engine PUBLIC
  $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/INC>)
target_link_libraries(engine PUBLIC kauai brender)

# On non-windows WIN32 is a no-op
add_executable(studio WIN32)
target_sources(studio
    PRIVATE
    "${PROJECT_SOURCE_DIR}/src/studio/ape.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/browser.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/esl.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/mminstal.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/popup.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/portf.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/scnsort.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/splot.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/stdiobrw.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/stdioscb.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/studio.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/tatr.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/tgob.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/utest.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/utest.rc"
    "${PROJECT_SOURCE_DIR}/src/studio/utest.rc2"
)
target_include_directories(studio
  PUBLIC $<TARGET_PROPERTY:engine,INCLUDE_DIRECTORIES>
  "${PROJECT_BINARY_DIR}/inc"
  "${PROJECT_SOURCE_DIR}/src")
target_compile_definitions(
    studio
    PRIVATE
    NAMES # Adds names to chunks in Chunky files
)
target_chomp_sources(studio
  "${PROJECT_SOURCE_DIR}/src/studio/utest.cht"
  "${PROJECT_SOURCE_DIR}/src/studio/studio.cht"
  "${PROJECT_SOURCE_DIR}/src/building/bldghd.cht"
  "${PROJECT_SOURCE_DIR}/src/building/building.cht"
  "${PROJECT_SOURCE_DIR}/src/helpaud/helpaud.cht"
  "${PROJECT_SOURCE_DIR}/src/help/help.cht"
  "${PROJECT_SOURCE_DIR}/src/shared/shared.cht"
  "${PROJECT_SOURCE_DIR}/src/shared/sharecd.cht")

target_link_libraries(studio PRIVATE engine)
set_property(TARGET studio PROPERTY OUTPUT_NAME 3dmovie)
target_link_options(studio BEFORE PRIVATE $<$<LINK_LANG_AND_ID:CXX,MSVC>:/MANIFESTUAC:NO>)
target_link_options(studio BEFORE PRIVATE "/manifestdependency:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='x86' publicKeyToken='6595b64144ccf1df' language='*'")
target_link_options(studio
  BEFORE PRIVATE
    $<$<AND:$<LINK_LANG_AND_ID:CXX,MSVC>,$<CONFIG:DEBUG>>:/NODEFAULTLIB:libcmt.lib>)

set_property(
    TARGET studio
    PROPERTY 3DMM_SAMPLES
    ${studio-samples}
    "${PROJECT_SOURCE_DIR}/samples/bongo.3mm"
    "${PROJECT_SOURCE_DIR}/samples/boooooo.3mm"
    "${PROJECT_SOURCE_DIR}/samples/citytour.3mm"
    "${PROJECT_SOURCE_DIR}/samples/graveyrd.3mm"
    "${PROJECT_SOURCE_DIR}/samples/haunted.3mm"
    "${PROJECT_SOURCE_DIR}/samples/hospital.3mm"
    "${PROJECT_SOURCE_DIR}/samples/jungle.3mm"
    "${PROJECT_SOURCE_DIR}/samples/message.3mm"
    "${PROJECT_SOURCE_DIR}/samples/space.3mm"
    "${PROJECT_SOURCE_DIR}/samples/sprog.3mm"
    "${PROJECT_SOURCE_DIR}/samples/terror.3mm"
    "${PROJECT_SOURCE_DIR}/samples/thebook.3mm"
    "${PROJECT_SOURCE_DIR}/samples/thelodge.3mm"
    "${PROJECT_SOURCE_DIR}/samples/thethief.3mm"
    "${PROJECT_SOURCE_DIR}/samples/venus31.3mm"
    "${PROJECT_SOURCE_DIR}/samples/where.3mm"
)
set_property(
    TARGET studio
    PROPERTY 3DMM_PROJECTS
    "${PROJECT_SOURCE_DIR}/projects/bongo.3mm"
    "${PROJECT_SOURCE_DIR}/projects/bridge.3mm"
    "${PROJECT_SOURCE_DIR}/projects/dialogue.3mm"
    "${PROJECT_SOURCE_DIR}/projects/jog.3mm"
    "${PROJECT_SOURCE_DIR}/projects/mummy.3mm"
    "${PROJECT_SOURCE_DIR}/projects/surprise.3mm"
)

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
