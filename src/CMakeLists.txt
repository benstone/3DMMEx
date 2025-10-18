# 3D Movie Maker

add_library(bren)
target_sources(bren
    PRIVATE
    "${PROJECT_SOURCE_DIR}/bren/bwld.cpp"
    "${PROJECT_SOURCE_DIR}/bren/stderr.c"
    "${PROJECT_SOURCE_DIR}/bren/stdfile.c"
    "${PROJECT_SOURCE_DIR}/bren/stdmem.c"
    "${PROJECT_SOURCE_DIR}/bren/tmap.cpp"
    "${PROJECT_SOURCE_DIR}/bren/zbmp.cpp"
)
target_include_directories(bren PUBLIC "${PROJECT_SOURCE_DIR}/bren/inc")
target_link_libraries(bren
    PUBLIC
    KauaiBase
    KauaiGroup
    BRender::Libraries
)

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
    "${PROJECT_SOURCE_DIR}/src/engine/tagl.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tagman.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tbox.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tdf.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tdt.cpp"
    "${PROJECT_SOURCE_DIR}/src/engine/tmpl.cpp"
)
if (3DMM_GUI STREQUAL "Win32" AND NOT 3DMM_AUDIOMAN_LIBRARY STREQUAL "None")
    target_sources(engine
        PRIVATE
        "${PROJECT_SOURCE_DIR}/src/engine/srecwin.cpp"
    )
else()
    target_sources(engine
        PRIVATE
        "${PROJECT_SOURCE_DIR}/src/engine/srecstub.cpp"
    )
endif()

target_include_directories(engine PUBLIC
  $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/inc>)
target_link_libraries(engine
    PUBLIC
    KauaiBase
    KauaiGui
    KauaiDoc
    KauaiRichText
    bren
)
if (NOT "${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "None")
    target_link_libraries(engine
        PUBLIC
        3DMMForever::AudioMan
    )
endif()

# On non-windows WIN32 is a no-op
add_executable(studio WIN32)
target_sources(studio
    PRIVATE
    "${PROJECT_SOURCE_DIR}/src/studio/ape.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/browser.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/esl.cpp"
    "${PROJECT_SOURCE_DIR}/src/studio/popup.cpp"
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

    # Windows
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/src/studio/portfwin.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/src/studio/mminstal.cpp>
    $<$<PLATFORM_ID:Windows>:${PROJECT_SOURCE_DIR}/src/studio/configwin.cpp>

    # non-Windows

    # TODO: replace with a module that saves settings to a file
    $<$<NOT:$<PLATFORM_ID:Windows>>:${PROJECT_SOURCE_DIR}/src/studio/configstub.cpp>
    $<$<NOT:$<PLATFORM_ID:Windows>>:${PROJECT_SOURCE_DIR}/src/studio/portfstub.cpp>
)

if(3DMM_GUI STREQUAL "SDL")
    target_sources(
        studio
        PRIVATE
        "${PROJECT_SOURCE_DIR}/src/studio/dlgsdl.cpp"
    )
endif()

target_include_directories(studio
  PUBLIC $<TARGET_PROPERTY:engine,INCLUDE_DIRECTORIES>
  "${PROJECT_BINARY_DIR}/inc"
  "${PROJECT_SOURCE_DIR}/src")

target_compile_definitions(
    studio
    PRIVATE
    NAMES # Adds names to chunks in Chunky files
)

# These are only here to ensure configure is rerun when dependencies are generated.
file(GLOB building-chunk-sources CONFIGURE_DEPENDS "${PROJECT_SOURCE_DIR}/src/building/*.cht")
file(GLOB studio-chunk-sources CONFIGURE_DEPENDS "${PROJECT_SOURCE_DIR}/src/studio/*.cht")

if (NOT 3DMM_PRECOMPILED_CHUNKY_PATH)
    target_chomp_sources(studio
        "${PROJECT_SOURCE_DIR}/src/studio/utest.cht"
        "${PROJECT_SOURCE_DIR}/src/studio/studio.cht"
        "${PROJECT_SOURCE_DIR}/src/building/bldghd.cht"
        "${PROJECT_SOURCE_DIR}/src/building/building.cht"
        "${PROJECT_SOURCE_DIR}/src/helpaud/helpaud.cht"
        "${PROJECT_SOURCE_DIR}/src/help/help.cht"
        "${PROJECT_SOURCE_DIR}/src/shared/shared.cht"
        "${PROJECT_SOURCE_DIR}/src/shared/sharecd.cht"
    )
endif()

target_link_libraries(studio
    PUBLIC
    KauaiBase
    KauaiGui
    KauaiGuiMain
    KauaiKid
    KauaiDlg
    engine

    $<$<PLATFORM_ID:Windows>:mpr> # Required for WNetGetUser()
    $<$<PLATFORM_ID:Windows>:vfw32> # Required for ICInfo in _wHaveICMCodec
    $<$<PLATFORM_ID:Windows>:msacm32> # Required for acmFormatTagDetailsA in _wHaveACMCodec
)

set_property(TARGET studio PROPERTY OUTPUT_NAME 3dmovie)

if(MSVC)
    target_link_options(studio
        BEFORE PRIVATE
        "/MANIFESTUAC:NO"
    )
    target_link_options(studio
        BEFORE PRIVATE
        "/manifestdependency:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
    )

    if ("${3DMM_AUDIOMAN_LIBRARY}" STREQUAL "Original")
        # Avoid LNK4098 warning when linking original AudioMan libraries
        target_link_options(studio
            BEFORE PRIVATE
            $<$<CONFIG:DEBUG>:/NODEFAULTLIB:libcmt.lib>
        )
    endif()
endif()

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

if (3DMM_PRECOMPILED_CHUNKY_PATH)
    set(chunky_files
        3dmovie.chk
        bldghd.chk
        building.chk
        help.chk
        helpaud.chk
        sharecd.chk
        shared.chk
        studio.chk
    )
    foreach(chunky_file ${chunky_files})
        install(
            FILES "${3DMM_PRECOMPILED_CHUNKY_PATH}/${chunky_file}"
            DESTINATION "Microsoft Kids/3D Movie Maker"
        )
    endforeach()
else()
    # HACK(bruxisma): This is due to UTEST.CHT not generating 3DMOVIE.CHK
    #                 Renaming it to 3DMOVIE.CHT would resolve this.
    install(FILES $<FILTER:$<TARGET_PROPERTY:studio,CHOMPED_CHUNKS>,EXCLUDE,.+utest[.]chk$>
      DESTINATION "Microsoft Kids/3D Movie Maker")
    install(FILES $<FILTER:$<TARGET_PROPERTY:studio,CHOMPED_CHUNKS>,INCLUDE,.+utest[.]chk$>
      RENAME 3dmovie.chk
      DESTINATION "Microsoft Kids/3D Movie Maker")
endif()
install(FILES $<TARGET_PROPERTY:studio,3DMM_PROJECTS>
  DESTINATION "Microsoft Kids/Users/Melanie")
install(FILES $<TARGET_PROPERTY:studio,3DMM_SAMPLES>
  DESTINATION "Microsoft Kids/Users/McZee")
install(DIRECTORY "${PROJECT_SOURCE_DIR}/content-files/"
  DESTINATION "Microsoft Kids/3D Movie Maker")

if (WIN32 AND 3DMM_GUI STREQUAL "SDL")
    # Install SDL DLLs
    install(FILES $<TARGET_FILE:SDL2::SDL2> $<TARGET_FILE:SDL2_ttf::SDL2_ttf>
        DESTINATION .)
endif()
