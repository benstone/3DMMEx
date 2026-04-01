/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: Mark Cave-Ayland
    Project: Kauai

    Graphical video implementation using gstreamer.

***************************************************************************/

#include "frame.h"
#include "gfx.h"
#include "videosdl.h"

#include <thread>

#include <gst/gst.h>
#include <gst/app/gstappsink.h>

#include <glib.h>
#include <SDL2/SDL.h>

ASSERTNAME

RTCLASS(GVID)
RTCLASS(GVGS)

BEGIN_CMD_MAP_BASE(GVGS)
END_CMD_MAP(&GVGS::FCmdAll, pvNil, kgrfcmmAll)

const int32_t kcmhlGvgs = kswMin; // put videos at the head of the list

PGVID GVID::PgvidNew(PFNI pfni, PGOB pgobBase, bool fHwndBased, int32_t hid)
{
    AssertPo(pfni, ffniFile);
    AssertPo(pgobBase, 0);

    return GVGS::PgvgsNew(pfni, pgobBase, hid);
}

GVID::GVID(int32_t hid) : GVID_PAR(hid)
{
    AssertBaseThis(0);
}

PGVGS GVGS::PgvgsNew(PFNI pfni, PGOB pgobBase, int32_t hid)
{
    AssertPo(pfni, ffniFile);
    PGVGS pgvgs;

    if (hid == hidNil)
        hid = CMH::HidUnique();

    if (pvNil == (pgvgs = NewObj GVGS(hid)))
        return pvNil;

    if (!pgvgs->_FInit(pfni, pgobBase))
    {
        ReleasePpo(&pgvgs);
        return pvNil;
    }

    return pgvgs;
}

GVGS::GVGS(int32_t hid) : GVGS_PAR(hid)
{
    AssertBaseThis(0);
}

GVGS::~GVGS(void)
{
    AssertBaseThis(0);

    if (_hth.joinable())
    {
        _fDone = fTrue;
        _nscb.hevt.Set();
        _hth.join();
    }
    _pastream->FStop();
    ReleasePpo(&_pastream);
    ReleasePpo(&_pgnv);
    SDL_FreeSurface(_surface);
}

bool GVGS::_FInit(PFNI pfni, PGOB pgobBase)
{
    AssertPo(pfni, ffniFile);
    AssertPo(pgobBase, 0);

    STN stnPath;
    STN stn;
    GError *error = NULL;
    GstSample *sample = NULL;
    GstCaps *caps = NULL;
    GstElement *vsink = NULL;
    GstStructure *structure = NULL;
    GstQuery *query = NULL;
    g_autofree gchar *uri = NULL;
    g_autofree gchar *desc = NULL;
    gint64 duration;
    gint gint_val;
    ma_device *pdevice;
    PGOB pgobScreen;
    int res;

    _pgobBase = pgobBase;
    pfni->GetStnPath(&stnPath);

    // Check the output format is correct
    pdevice = MiniaudioManager::Pmanager()->Pengine()->pDevice;
    if (pdevice->playback.format != ma_format_f32)
    {
        Bug("expected f32 format");
        goto LFail;
    }

    if (pdevice->playback.channels != 2)
    {
        Bug("expected stereo");
        goto LFail;
    }

    gst_init(NULL, NULL);

    uri = g_uri_escape_string(stnPath.Psz(), "/", TRUE);
    desc = g_strdup_printf("uridecodebin uri=file://%s name=u ! videoconvert ! videoscale !"
                           " appsink name=vsink caps=\"video/x-raw,format=BGRA,pixel-aspect-ratio=1/1\""
                           " u. ! audioconvert ! audioresample ! appsink name=asink "
                           "caps=\"audio/x-raw,format=F32LE,rate=%d,channels=%d,layout=interleaved\"",
                           uri, pdevice->playback.converter.sampleRateOut, pdevice->playback.channels);

    _nscb.pipeline = gst_parse_launch(desc, &error);
    if (error != NULL)
    {
        Bug("Unable to setup gstreamer pipeline");
        goto LFail;
    }

    // Find width and height
    gst_element_set_state(_nscb.pipeline, GST_STATE_PAUSED);
    vsink = gst_bin_get_by_name(GST_BIN(_nscb.pipeline), "vsink");
    g_signal_emit_by_name(vsink, "pull-preroll", &sample, NULL);
    caps = gst_sample_get_caps(sample);
    if (!caps)
    {
        Bug("Unable to retrieve caps");
        goto LFail;
    }
    structure = gst_caps_get_structure(caps, 0);

    res = gst_structure_get_int(structure, "width", &gint_val);
    if (!res)
    {
        Bug("Unable to retrieve video width");
        goto LFail;
    }
    _dxp = gint_val;
    res = gst_structure_get_int(structure, "height", &gint_val);
    if (!res)
    {
        Bug("Unable to retrieve video height");
        goto LFail;
    }
    _dyp = gint_val;

    // Determine the total number of frames in the file
    query = gst_query_new_duration(GST_FORMAT_DEFAULT);
    res = gst_element_query(_nscb.pipeline, query);
    if (!res)
    {
        Bug("Unable to retrieve video frame count");
        goto LFail;
    }
    gst_query_parse_duration(query, NULL, &duration);
    _nfrMac = duration;

    // Create surface
    _surface = SDL_CreateRGBSurface(0, _dxp, _dyp, 32, 0, 0, 0, 0);
    if (_surface == NULL)
    {
        Bug("Unable to create SDL surface");
        goto LFail;
    }

    // Create the stream and start playing it
    _pastream = MiniaudioStream::PastreamNew(MiniaudioManager::Pmanager());
    AssertPo(_pastream, 0);
    AssertDo(_pastream->FPlay(), "Could not play");

    // Create GNV for the screen
    pgobScreen = GOB::PgobScreen();
    _pgnv = NewObj GNV(pgobScreen, pgobScreen->Pgpt());
    if (_pgnv == pvNil)
        goto LFail;

    _hth = std::thread([this] { return this->_LuThread(); });

    return fTrue;

LFail:
    return fFalse;
}

static void NewVideoSample(GstAppSink *vsink, NSCB *nscb)
{
    // Retrieve video frame and signal playback thread
    nscb->vsample = gst_app_sink_pull_sample(vsink);
    nscb->hevt.Set();
}

static void NewAudioSample(GstAppSink *asink, NSCB *nscb)
{
    // Retrieve audio frame and signal playback thread
    nscb->asample = gst_app_sink_pull_sample(asink);
    nscb->hevt.Set();
}

/***************************************************************************
    AT: The video stream playback thread.
***************************************************************************/
uint32_t GVGS::_LuThread(void)
{
    AssertThis(0);

    GstElement *vsink;
    GstElement *asink;
    GError *error = NULL;
    bool fPlaying = false;

    vsink = gst_bin_get_by_name(GST_BIN(_nscb.pipeline), "vsink");
    g_object_set(G_OBJECT(vsink), "emit-signals", TRUE, NULL);
    g_signal_connect(vsink, "new-sample", G_CALLBACK(NewVideoSample), &_nscb);
    asink = gst_bin_get_by_name(GST_BIN(_nscb.pipeline), "asink");
    g_object_set(G_OBJECT(asink), "emit-signals", TRUE, NULL);
    g_signal_connect(asink, "new-sample", G_CALLBACK(NewAudioSample), &_nscb);

    for (;;)
    {
        _nscb.hevt.Wait();

        if (_fDone)
            break;

        _mutx.Enter();

        if (_fPlaying != fPlaying)
        {
            if (_fPlaying == fTrue)
                gst_element_set_state(_nscb.pipeline, GST_STATE_PLAYING);
            else
                gst_element_set_state(_nscb.pipeline, GST_STATE_PAUSED);
        }

        if (_fPlaying)
        {
            if (_nscb.vsample != NULL)
            {
                GstBuffer *buffer;
                GstSample *sample;
                GstMapInfo map;

                buffer = gst_sample_get_buffer(_nscb.vsample);
                if (gst_buffer_map(buffer, &map, GST_MAP_READ))
                {
                    // Update the surface with the mapped buffer and indicate
                    // to command handler that a frame is ready to display
                    CopyPb(map.data, _surface->pixels, _dxp * 4 * _dyp);
                    _nscb.fFrameReady = true;
                    gst_buffer_unmap(buffer, &map);
                }
                gst_sample_unref(_nscb.vsample);
                _nscb.vsample = NULL;
            }

            if (_nscb.asample != NULL)
            {
                GstBuffer *buffer;
                GstSample *sample;
                GstMapInfo map;

                buffer = gst_sample_get_buffer(_nscb.asample);
                if (gst_buffer_map(buffer, &map, GST_MAP_READ))
                {
                    _pastream->FWriteAudio(map.data, map.size / (sizeof(float) * 2));
                }
                gst_sample_unref(_nscb.asample);
                _nscb.asample = NULL;
            }

            if (gst_app_sink_is_eos(GST_APP_SINK_CAST(vsink)) && gst_app_sink_is_eos(GST_APP_SINK_CAST(asink)))
            {
                gst_element_set_state(_nscb.pipeline, GST_STATE_PAUSED);
                _fPlaying = fFalse;
            }
        }

        fPlaying = _fPlaying;

        _mutx.Leave();
    }

    gst_element_set_state(_nscb.pipeline, GST_STATE_PAUSED);

    return 0;
}

int32_t GVGS::NfrMac(void)
{
    AssertThis(0);

    return _nfrMac;
}

int32_t GVGS::NfrCur(void)
{
    AssertThis(0);

    return 0;
}

void GVGS::GotoNfr(int32_t nfr)
{
    AssertThis(0);
    AssertIn(nfr, 0, _nfrMac);
}

bool GVGS::FPlaying(void)
{
    AssertThis(0);

    return _fPlaying;
}

bool GVGS::FPlay(RC *prc)
{
    AssertThis(0);
    AssertNilOrVarMem(prc);

    Stop();

    _mutx.Enter();
    if (!vpcex->FAddCmh(this, kcmhlGvgs, kgrfcmmAll))
        return fFalse;

    SetRcPlay(prc);

    _fPlaying = fTrue;
    _mutx.Leave();

    _nscb.hevt.Set();

    return fTrue;
}

void GVGS::SetRcPlay(RC *prc)
{
    AssertThis(0);
    AssertNilOrVarMem(prc);

    if (pvNil == prc)
        _rcPlay.Set(0, 0, _dxp, _dyp);
    else
        _rcPlay = *prc;
}

void GVGS::Stop(void)
{
    AssertThis(0);

    if (!_fPlaying)
        return;

    _mutx.Enter();
    vpcex->RemoveCmh(this, kcmhlGvgs);
    _fPlaying = fFalse;
    _mutx.Leave();

    _nscb.hevt.Set();
}

void GVGS::Draw(PGNV pgnv, RC *prc)
{
    AssertThis(0);
    AssertPo(pgnv, 0);
    AssertVarMem(prc);

    _SetRc();
}

void GVGS::_SetRc(void)
{
    AssertThis(0);
    RC rcGob, rc;

    _pgobBase->GetRc(&rcGob, cooHwnd);
    rc = _rcPlay;
    rc.Offset(rcGob.xpLeft, rcGob.ypTop);
    if (_rc != rc || !_fVisible)
    {
        _fVisible = fTrue;
        _rc = rc;
    }

    if (_cactPal != vcactRealize)
    {
        _cactPal = vcactRealize;
    }
}

void GVGS::GetRc(RC *prc)
{
    AssertThis(0);
    AssertVarMem(prc);

    prc->Set(0, 0, _dxp, _dyp);
}

bool GVGS::FCmdAll(PCMD pcmd)
{
    AssertThis(0);
    AssertVarMem(pcmd);

    if (_nscb.fFrameReady == fTrue)
    {
        // Draw the frame in the command handler to ensure that the SDL surface
        // is updated from the main thread (SDL is not completely thread safe)
        _pgnv->DrawSurface(_surface, &_rc);
        _nscb.fFrameReady = false;
    }

    return fFalse;
}

#ifdef DEBUG
void GVGS::AssertValid(uint32_t grf)
{
    GVGS_PAR::AssertValid(0);

    Assert(_surface != hNil, 0);
    AssertPo(_pgobBase, 0);
}

void GVGS::MarkMem(void)
{
    GVGS_PAR::MarkMem();

    MarkMemObj(_pastream);
    MarkMemObj(_pgnv);
}
#endif // DEBUG
