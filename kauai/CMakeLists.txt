# Kauai

if (ENABLE_ASM_X86)
    # Generate Kauai decoders for Intel x86
    add_executable(kcdc-386 EXCLUDE_FROM_ALL)
    target_sources(kcdc-386 PRIVATE "${PROJECT_SOURCE_DIR}/kauai/src/kcdc_386.c")
    target_include_directories(kcdc-386 PRIVATE $<TARGET_PROPERTY:KauaiBase,INCLUDE_DIRECTORIES>)

    add_executable(kcd2-386 EXCLUDE_FROM_ALL)
    target_sources(kcd2-386 PRIVATE "${PROJECT_SOURCE_DIR}/kauai/src/kcd2_386.c")
    target_include_directories(kcd2-386 PRIVATE $<TARGET_PROPERTY:KauaiBase,INCLUDE_DIRECTORIES>)

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

# Build frame chunk headers
add_custom_command(
    OUTPUT ${PROJECT_BINARY_DIR}/generated/kauai/src/framechk.h
    DEPENDS ${PROJECT_SOURCE_DIR}/kauai/src/framechk.in
    COMMAND ${CMAKE_COMMAND} -E make_directory "${PROJECT_BINARY_DIR}/generated/kauai/src"
    COMMAND ${CMAKE_COMMAND}
    ARGS -DINPUT_FILE=${PROJECT_SOURCE_DIR}/kauai/src/framechk.in -DOUTPUT_FILE=${PROJECT_BINARY_DIR}/generated/kauai/src/framechk.h -P ${PROJECT_SOURCE_DIR}/cmake/GenerateChunkTags.cmake
    COMMENT "Generating frame chunk headers"
)

# Build kid chunk headers
add_custom_command(
    OUTPUT ${PROJECT_BINARY_DIR}/generated/kauai/src/kidchk.h
    DEPENDS ${PROJECT_SOURCE_DIR}/kauai/src/kidchk.in
    COMMAND ${CMAKE_COMMAND} -E make_directory "${PROJECT_BINARY_DIR}/generated/kauai/src"
    COMMAND ${CMAKE_COMMAND}
    ARGS -DINPUT_FILE=${PROJECT_SOURCE_DIR}/kauai/src/kidchk.in -DOUTPUT_FILE=${PROJECT_BINARY_DIR}/generated/kauai/src/kidchk.h -P ${PROJECT_SOURCE_DIR}/cmake/GenerateChunkTags.cmake
    COMMENT "Generating kid chunk headers"
)

add_custom_target(
    GenerateChunkTags DEPENDS
    "${PROJECT_BINARY_DIR}/generated/kauai/src/framechk.h"
    "${PROJECT_BINARY_DIR}/generated/kauai/src/kidchk.h"
)

# Base: Base files required for all Kauai projects
add_library(KauaiBase
    "${PROJECT_SOURCE_DIR}/kauai/src/utilglob.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/util.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/base.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilcopy.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilerro.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilint.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilmem.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilrnd.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/utilstr.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/mssio.cpp"

    # Windows implementations
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/memwin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/platwin.cpp>
)
target_include_directories(
    KauaiBase
    PUBLIC
    "${PROJECT_SOURCE_DIR}/kauai/src"
    "${PROJECT_BINARY_DIR}/generated/kauai/src"
)
target_link_libraries(
    KauaiBase
    PUBLIC
    $<$<PLATFORM_ID:Windows>:winmm>
)
target_compile_definitions(
    KauaiBase
    PUBLIC
    _LPCVOID_DEFINED
    STRICT
)
add_dependencies(KauaiBase GenerateChunkTags)

if (3DMM_GUI STREQUAL "Win32")
    target_compile_definitions(
        KauaiBase
        PUBLIC
        KAUAI_WIN32
    )
elseif(3DMM_GUI STREQUAL "SDL")
    target_compile_definitions(
        KauaiBase
        PUBLIC
        KAUAI_SDL
    )
    target_link_libraries(
        KauaiBase
        PUBLIC
        SDL2::SDL2
        SDL2_ttf::SDL2_ttf
    )
else()
    message(FATAL_ERROR "Invalid GUI specified: ${3DMM_GUI}")
endif()


# Groups: Collection classes
add_library(KauaiGroup
    "${PROJECT_SOURCE_DIR}/kauai/src/groups.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/groups2.cpp"
)
target_link_libraries(
    KauaiGroup
    PUBLIC
    KauaiBase
)

# File: File and chunky file stuff
add_library(KauaiFile
    "${PROJECT_SOURCE_DIR}/kauai/src/chunk.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/codec.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/codkauai.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/crf.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/file.cpp"

    # Windows implementations
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/filewin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/fniwin.cpp>
)
if (ENABLE_ASM_X86)
    target_sources(
        KauaiFile
        PRIVATE
        "${PROJECT_BINARY_DIR}/generated/kauai/src/kcdc_386.h"
        "${PROJECT_BINARY_DIR}/generated/kauai/src/kcd2_386.h"
    )
    target_include_directories(
        KauaiFile
        PRIVATE
        "$<BUILD_INTERFACE:${PROJECT_BINARY_DIR}/generated/kauai/src>"
    )
endif()
target_link_libraries(
    KauaiFile
    PUBLIC
    KauaiGroup
)

# Stream
add_library(KauaiStream
    "${PROJECT_SOURCE_DIR}/kauai/src/stream.cpp"
)
target_link_libraries(
    KauaiStream
    PUBLIC
    KauaiGroup
)

# Lexer: Lexing classes
add_library(KauaiLexer
    "${PROJECT_SOURCE_DIR}/kauai/src/lex.cpp"
)
target_link_libraries(
    KauaiLexer
    PUBLIC
    KauaiStream
)

# Scrcom: Script compiler
add_library(KauaiScrCom
    "${PROJECT_SOURCE_DIR}/kauai/src/scrcom.cpp"
)
target_link_libraries(
    KauaiScrCom
    PUBLIC
    KauaiLexer
    KauaiScrExe
)

# Kidcom: Script compiler for Kidspace scripts
add_library(KauaiKidCom
    "${PROJECT_SOURCE_DIR}/kauai/src/scrcomg.cpp"
)
target_link_libraries(
    KauaiKidCom
    PUBLIC
    KauaiScrCom
)

# ScrExe: Script interpreter
add_library(KauaiScrExe
    "${PROJECT_SOURCE_DIR}/kauai/src/screxe.cpp"
)
target_link_libraries(
    KauaiScrExe
    PUBLIC
    KauaiFile
    KauaiGroup
)

# MbmpIO: Masked bitmap IO support
add_library(KauaiMbmpIO
    "${PROJECT_SOURCE_DIR}/kauai/src/mbmp.cpp"
)
target_link_libraries(
    KauaiMbmpIO
    PUBLIC
    KauaiFile
)

# Chse: Chunky source emitter
add_library(KauaiChse
    "${PROJECT_SOURCE_DIR}/kauai/src/chse.cpp"
)
target_link_libraries(
    KauaiChse
    PUBLIC
    KauaiGroup
)

# Chcm: Chunky compiler and decompiler classes
add_library(
    KauaiChcm
    "${PROJECT_SOURCE_DIR}/kauai/src/chcm.cpp"
)
target_link_libraries(
    KauaiChcm
    PUBLIC
    KauaiLexer
    KauaiChse
    KauaiMbmpIO
    KauaiKidCom
)

# Sound
add_library(
    KauaiSound
    "${PROJECT_SOURCE_DIR}/kauai/src/sndm.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/midi.cpp"
)
target_link_libraries(
    KauaiSound
    PUBLIC
    KauaiGroup
    KauaiStream
)

if (3DMM_GUI STREQUAL "Win32")
    # Win32: Use AudioMan for wave sounds

    if (NOT "${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "None")
        target_sources(
            KauaiSound
            PRIVATE
            "${PROJECT_SOURCE_DIR}/kauai/src/sndam.cpp"
        )
        target_link_libraries(
            KauaiSound
            PUBLIC
            3DMMForever::AudioMan
            msacm32
        )
        if ("${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "Original")
            # The static library requires a stub for some old MSVC floating-point division helper functions
            add_library(
                FDivStub
                "${PROJECT_SOURCE_DIR}/kauai/src/stub.cpp"
            )
            target_link_libraries(
                KauaiSound
                PRIVATE
                FDivStub
            )
        endif()
    endif()

    # Use Win32 MIDI player
    target_sources(
        KauaiSound
        PRIVATE
        "${PROJECT_SOURCE_DIR}/kauai/src/mididev.cpp"
        "${PROJECT_SOURCE_DIR}/kauai/src/mididev2.cpp"
    )
    target_link_libraries(
        KauaiSound
        PUBLIC
        winmm
    )

else()
    message(WARNING "Sound playback disabled")
endif()

# Pic: vector graphics support
add_library(KauaiPic
    "${PROJECT_SOURCE_DIR}/kauai/src/pic.cpp"
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/kauai/src/picwin.cpp>
)
target_link_libraries(
    KauaiPic
    PUBLIC
    KauaiBase
)

# Spell: Spell checker interface
add_library(KauaiSpell
    "${PROJECT_SOURCE_DIR}/kauai/src/spell.cpp"
)
target_link_libraries(
    KauaiSpell
    PUBLIC
    KauaiBase
    KauaiGroup
)

# Video: video playback
if (3DMM_GUI STREQUAL "Win32")
    add_library(KauaiVideo
        "${PROJECT_SOURCE_DIR}/kauai/src/videowin.cpp"
    )
    target_link_libraries(
        KauaiVideo
        PUBLIC
        KauaiGui
        $<$<PLATFORM_ID:Windows>:Vfw32>
    )
else()
    message(WARNING "Video playback not implemented on GUI platform: ${3DMM_GUI}")

    # Use stub implementation
    add_library(KauaiVideo
        "${PROJECT_SOURCE_DIR}/kauai/src/videostub.cpp"
    )
    target_link_libraries(
        KauaiVideo
        PUBLIC
        KauaiGui
    )
endif()

# GUI
add_library(KauaiGui
    "${PROJECT_SOURCE_DIR}/kauai/src/appb.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/clok.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/cmd.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/gfx.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/gob.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/mbmpgui.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/region.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/accelerator.cpp"
)

target_link_libraries(
    KauaiGui
    PUBLIC
    KauaiBase
    KauaiGroup
    KauaiMbmpIO
    KauaiSound
    KauaiVideo
    KauaiPic
)
target_include_directories(
    KauaiGui
    PUBLIC
    "${PROJECT_SOURCE_DIR}/kauai/src"
)

if (3DMM_GUI STREQUAL "Win32")
    target_sources(
        KauaiGui
        PRIVATE
        ${PROJECT_SOURCE_DIR}/kauai/src/appbwin.cpp
        ${PROJECT_SOURCE_DIR}/kauai/src/menuwin.cpp
        ${PROJECT_SOURCE_DIR}/kauai/src/gfxwin.cpp
        ${PROJECT_SOURCE_DIR}/kauai/src/gobwin.cpp
        ${PROJECT_SOURCE_DIR}/kauai/src/cursorwin.cpp
    )
elseif(3DMM_GUI STREQUAL "SDL")
    target_sources(
        KauaiGui
        PRIVATE
        ${PROJECT_SOURCE_DIR}/kauai/src/appbsdl.cpp
        ${PROJECT_SOURCE_DIR}/kauai/src/menusdl.cpp
        ${PROJECT_SOURCE_DIR}/kauai/src/gfxsdl.cpp
        ${PROJECT_SOURCE_DIR}/kauai/src/gobsdl.cpp
        ${PROJECT_SOURCE_DIR}/kauai/src/fontsdl.cpp
        ${PROJECT_SOURCE_DIR}/kauai/src/cursorsdl.cpp
    )

    find_package(Fontconfig)
    if(Fontconfig_FOUND)
        target_sources(
            KauaiGui
            PRIVATE
            ${PROJECT_SOURCE_DIR}/kauai/src/fontsdllinux.cpp
        )
        target_link_libraries(
            KauaiGui
            PRIVATE
            Fontconfig::Fontconfig
        )
    elseif(WIN32)
        target_sources(
            KauaiGui
            PRIVATE
            ${PROJECT_SOURCE_DIR}/kauai/src/fontsdlwin.cpp
        )
    else()
        target_sources(
            KauaiGui
            PRIVATE
            ${PROJECT_SOURCE_DIR}/kauai/src/fontsdlbundle.cpp
        )

        # TODO: Bundle some fonts with 3DMM
        #install(FILES font.ttf DESTINATION "fonts")
    endif()
else()
    message(FATAL_ERROR "Invalid GUI specified: ${3DMM_GUI}")
endif()

# GUI application entrypoint
add_library(
    KauaiGuiMain
    "${PROJECT_SOURCE_DIR}/kauai/src/appassert.cpp"
)
target_link_libraries(
    KauaiGuiMain
    PUBLIC
    KauaiGui
)
target_include_directories(
    KauaiGuiMain
    PUBLIC
    "${PROJECT_SOURCE_DIR}/kauai/src"
)

if (3DMM_GUI STREQUAL "Win32")
    target_sources(
        KauaiGuiMain
        PRIVATE
        "${PROJECT_SOURCE_DIR}/kauai/src/appmainwin.cpp"
    )
elseif(3DMM_GUI STREQUAL "SDL")
    target_sources(
        KauaiGuiMain
        PRIVATE
        "${PROJECT_SOURCE_DIR}/kauai/src/appmainsdl.cpp"
    )
else()
    message(FATAL_ERROR "Invalid GUI specified: ${3DMM_GUI}")
endif()


# Dlg: Dialog support
add_library(KauaiDlg
    "${PROJECT_SOURCE_DIR}/kauai/src/dlg.cpp"
)
target_link_libraries(
    KauaiDlg
    PUBLIC
    KauaiGui
)

if (3DMM_GUI STREQUAL "Win32")
    target_sources(
        KauaiDlg
        PRIVATE
        ${PROJECT_SOURCE_DIR}/kauai/src/dlgwin.cpp
    )
elseif(3DMM_GUI STREQUAL "SDL")
    # SDL dialogs are implemented in the studio project
endif()

# Ctl: Control support (Win32 only)
if (3DMM_GUI STREQUAL "Win32")
    add_library(KauaiCtl
        "${PROJECT_SOURCE_DIR}/kauai/src/ctl.cpp"
    )
    target_link_libraries(
        KauaiCtl
        PUBLIC
        KauaiGui
    )
endif()

# Doc: Base document class support
add_library(KauaiDoc
    "${PROJECT_SOURCE_DIR}/kauai/src/docb.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/clip.cpp"
)
target_link_libraries(
    KauaiDoc
    PRIVATE
    KauaiGui
)

if (3DMM_GUI STREQUAL "Win32")
    target_link_libraries(
        KauaiDoc
        PRIVATE
        KauaiCtl
    )
endif()

# RichText: Rich text document support
add_library(KauaiRichText
    "${PROJECT_SOURCE_DIR}/kauai/src/rtxt.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/rtxt2.cpp"
)
target_link_libraries(
    KauaiRichText
    PUBLIC
    KauaiDoc
    KauaiStream
)

# TextEdit: Edit controls
add_library(KauaiTextEdit
    "${PROJECT_SOURCE_DIR}/kauai/src/text.cpp"
)
target_link_libraries(
    KauaiTextEdit
    PUBLIC
    KauaiGui
    KauaiStream
)

# PlainText: Plain line-based text document
add_library(KauaiPlainText
    "${PROJECT_SOURCE_DIR}/kauai/src/textdoc.cpp"
)
target_link_libraries(
    KauaiPlainText
    PUBLIC
    KauaiDoc
    KauaiStream
)


# Kid: Kidspace and help balloon stuff
add_library(KauaiKid
    "${PROJECT_SOURCE_DIR}/kauai/src/kidworld.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/kidhelp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/kidspace.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/screxeg.cpp"
)
target_link_libraries(
    KauaiKid
    PUBLIC
    KauaiGui
    KauaiScrExe
    KauaiScrCom
    KauaiTextEdit
)

# Unit tests
if (BUILD_TESTS)
    add_library(
        KauaiTestLib
        STATIC
        "${PROJECT_SOURCE_DIR}/kauai/test/assert.cpp"
        "${PROJECT_SOURCE_DIR}/kauai/test/resources.cpp"
    )
    target_include_directories(
        KauaiTestLib
        PUBLIC
        "${PROJECT_SOURCE_DIR}/kauai/test"
    )
    target_link_libraries(
        KauaiTestLib
        PUBLIC
        KauaiBase
        KauaiFile
        GTest::gtest
    )
    target_compile_definitions(
        KauaiTestLib
        PRIVATE
        KAUAI_TEST_RESOURCES_PATH="${CMAKE_CURRENT_SOURCE_DIR}/test/res"
    )

    add_executable(KauaiTest
        "${PROJECT_SOURCE_DIR}/kauai/test/kauai_test.cpp"
        "${PROJECT_SOURCE_DIR}/kauai/test/compression_test.cpp"
        "${PROJECT_SOURCE_DIR}/kauai/test/compiler_test.cpp"
        "${PROJECT_SOURCE_DIR}/kauai/test/string_test.cpp"
    )
    target_link_libraries(
        KauaiTest
        PUBLIC
        KauaiTestLib
        KauaiGroup
        KauaiChcm
        KauaiSound
        GTest::gtest_main
    )
    gtest_discover_tests(KauaiTest)

    add_executable(KauaiGuiTest
        "${PROJECT_SOURCE_DIR}/kauai/test/gui_test.cpp"
    )
    target_link_libraries(
        KauaiGuiTest
        PUBLIC
        KauaiTestLib
        KauaiGui
        KauaiRichText
        GTest::gtest_main
    )
    gtest_discover_tests(KauaiGuiTest)

    add_dependencies(
        tests
        KauaiTest
        KauaiGuiTest
    )
endif()

# Utilities

# Add a meta target to build all Kauai tools
add_custom_target(tools)

# Chomp compiler
add_executable(chomp)
target_sources(chomp
    PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/chomp.cpp"
)
target_link_libraries(
    chomp
    PRIVATE
    KauaiBase
    KauaiChcm
    KauaiSound
    KauaiPic
)
add_dependencies(tools chomp)

if(3DMM_GUI STREQUAL "SDL")
    add_custom_command(
        TARGET chomp
        POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different $<TARGET_FILE:SDL2::SDL2> $<TARGET_FILE_DIR:chomp>
    )
endif()

# Hello World test app
add_executable(khello WIN32)
target_sources(khello
    PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/test/khello/khello.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/test/khello/khello.rc"
)
target_link_libraries(
    khello
    PRIVATE
    KauaiGui
    KauaiGuiMain
    KauaiDoc # TODO: should this be a dependency of KauaiGui?
    KauaiRichText
)

if (WIN32 AND 3DMM_GUI STREQUAL "SDL")
    add_custom_command(
        TARGET khello POST_BUILD
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different "$<TARGET_FILE:SDL2::SDL2>" "$<TARGET_FILE_DIR:khello>"
        VERBATIM
    )
    add_custom_command(
        TARGET khello POST_BUILD
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different "$<TARGET_FILE:SDL2_ttf::SDL2_ttf>" "$<TARGET_FILE_DIR:khello>"
        VERBATIM
    )
endif()

if (3DMM_GUI STREQUAL "Win32")
    set(BUILD_KAUAI_TOOLS ON)
else()
    set(BUILD_KAUAI_TOOLS OFF)
endif()

if (BUILD_KAUAI_TOOLS)

# Chelp: Help editor
add_executable(chelp WIN32 EXCLUDE_FROM_ALL)
target_sources(chelp PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/chtop.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelpexp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelp.rc"
)
target_link_libraries(chelp
    PRIVATE
    KauaiBase
    KauaiGui
    KauaiGuiMain
    KauaiGroup
    KauaiMbmpIO
    KauaiSound
    KauaiVideo
    KauaiKid
    KauaiScrExe
    KauaiRichText
    KauaiDoc
    KauaiStream
    KauaiFile
    KauaiChse
    KauaiDlg
    KauaiScrCom
    KauaiLexer
    KauaiCtl
    KauaiTextEdit
    KauaiSpell
    KauaiPic
)
add_dependencies(tools chelp)

# Frame Tester
add_executable(ft WIN32 EXCLUDE_FROM_ALL)
target_sources(ft PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/src/test.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/src/ft.rc"
    "${PROJECT_SOURCE_DIR}/kauai/src/ft.cpp"
)
target_link_libraries(
    ft
    PRIVATE
    KauaiBase
    KauaiGroup
    KauaiFile
    KauaiGui
    KauaiGuiMain
    KauaiDoc
    KauaiStream
    KauaiSound
    KauaiDlg
    KauaiCtl
    KauaiTextEdit
    KauaiRichText
    KauaiMbmpIO
    KauaiPic
)
add_dependencies(tools ft)

# Utility Tester
add_executable(ut EXCLUDE_FROM_ALL)
target_sources(ut PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/src/ut.cpp"
)
target_link_libraries(
    ut
    PRIVATE
    KauaiBase
    KauaiGroup
    KauaiFile
)
add_dependencies(tools ut)

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
target_link_libraries(ched
    PRIVATE
    KauaiGui
    KauaiGuiMain
    KauaiDlg
    KauaiKid
    KauaiKidCom
    KauaiDoc
    KauaiTextEdit
    KauaiRichText
    KauaiPlainText
    KauaiPic
    KauaiChcm
)
add_dependencies(tools ched)

# mkmbmp
add_executable(mkmbmp EXCLUDE_FROM_ALL)
target_sources(mkmbmp PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/mkmbmp.cpp"
)
target_link_libraries(
    mkmbmp
    PRIVATE
    KauaiBase
    KauaiFile
    KauaiGroup
    KauaiMbmpIO
)
add_dependencies(tools mkmbmp)

# kpack
add_executable(kpack EXCLUDE_FROM_ALL)
target_sources(kpack PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/kpack.cpp"
)
target_link_libraries(
    kpack
    PRIVATE
    KauaiBase
    KauaiFile
    KauaiGroup
)
add_dependencies(tools kpack)

# Chmerge: Chunky merge tool
add_executable(chmerge EXCLUDE_FROM_ALL)
target_sources(chmerge PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/chmerge.cpp"
)
target_link_libraries(
    chmerge
    PRIVATE
    KauaiBase
    KauaiFile
    KauaiGroup
)
add_dependencies(tools chmerge)

# Chelpdmp: Chunky help dumper tool
add_executable(chelpdmp EXCLUDE_FROM_ALL)
target_sources(chelpdmp PRIVATE
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelpdmp.cpp"
    "${PROJECT_SOURCE_DIR}/kauai/tools/chelpexp.cpp"
)
target_link_libraries(chelpdmp
    PRIVATE
    KauaiBase
    KauaiFile
    KauaiGroup
    KauaiLexer
    KauaiStream
    KauaiScrCom
    KauaiScrExe
    KauaiChse
)
add_dependencies(tools chelpdmp)

endif()
