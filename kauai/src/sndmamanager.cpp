/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    Miniaudio engine manager

***************************************************************************/
#include "frame.h"
ASSERTNAME

#include "sndma.h"
#include "sndmapri.h"

RTCLASS(MiniaudioManager)

MiniaudioManager::MiniaudioManager()
{
    ClearPb(&_engine, SIZEOF(_engine));
    _fInit = fFalse;
}

MiniaudioManager::~MiniaudioManager()
{
    ma_engine_stop(&_engine);
    ma_engine_uninit(&_engine);
    _fInit = fFalse;
}

ma_engine *MiniaudioManager::Pengine()
{
    // Initialise the miniaudio engine if we haven't already
    ma_engine *pengine = &_engine;

    _mutxInit.Enter();
    if (!_fInit)
    {
        ma_engine_config config = ma_engine_config_init();

        ma_result result = ma_engine_init(&config, &_engine);
        AssertMaSuccess(result, "ma_engine_init failed");
        if (result == MA_SUCCESS)
        {
            _fInit = fTrue;
        }
        else
        {
            pengine = pvNil;
        }
    }

    _mutxInit.Leave();
    return pengine;
}

PMiniaudioManager MiniaudioManager::Pmanager()
{
    static PMiniaudioManager s_pmamanager = pvNil;

    if (s_pmamanager == pvNil)
    {
        s_pmamanager = NewObj MiniaudioManager;
    }

    return s_pmamanager;
}
