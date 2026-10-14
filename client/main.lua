local lastGear = 0

-- Show speedometer
RegisterNetEvent("speedometer:show")
AddEventHandler("speedometer:show", function(isMetric, speed, rpm, gear, fuelLevel, engineHealth, engineOn)
    local showRpm    = Config.Display.ShowRpm
    local showGear   = Config.Display.ShowGear
    local enableSounds = Config.Sound.EnableSounds

    if not showGear then enableSounds = false end

    SendNUIMessage({
        action       = "show",
        isMetric     = isMetric,
        speed        = speed,
        rpm          = showRpm  and rpm  or nil,
        gear         = showGear and gear or nil,
        fuel         = fuelLevel,
        engineHealth = engineHealth,
        engineOn     = engineOn,
    })

    if gear ~= lastGear then
        if gear == 0 and enableSounds then
            PlaySoundFrontend(-1, "CONFIRM_BEEP", "HUD_MINI_GAME_SOUNDSET", true)
        elseif gear > lastGear and enableSounds then
            PlaySoundFrontend(-1, "NAV_UP_DOWN", "HUD_FRONTEND_DEFAULT_SOUNDSET", true)
        end
        lastGear = gear
    end
end)

-- Hide speedometer
RegisterNetEvent("speedometer:hide")
AddEventHandler("speedometer:hide", function()
    SendNUIMessage({ action = "hide" })
end)

-- Main loop
Citizen.CreateThread(function()
    while true do
        local ped     = GetPlayerPed(-1)
        local vehicle = GetVehiclePedIsIn(ped, false)

        if vehicle ~= 0 then
            local fuel         = Config.GetVehicleFuel(vehicle)
            local engineHealth = GetVehicleEngineHealth(vehicle) / 10
            local engineOn     = GetIsVehicleEngineRunning(vehicle)
            TriggerEvent(
                "speedometer:show",
                Config.UseMetricMeasurements,
                GetEntitySpeed(vehicle),
                GetVehicleCurrentRpm(vehicle),
                GetVehicleCurrentGear(vehicle),
                fuel,
                engineHealth,
                engineOn
            )
        else
            TriggerEvent("speedometer:hide")
        end

        HideHudComponentThisFrame(7)
        HideHudComponentThisFrame(9)

        Citizen.Wait(1)
    end
end)

-- Toggle command
RegisterCommand(Config.ToggleCommand, function(source, args)
    local setting  = args[1]
    local ped      = GetPlayerPed(-1)
    local vehicle  = GetVehiclePedIsIn(ped, false)

    if setting == "rpm" then
        Config.Display.ShowRpm = not Config.Display.ShowRpm
        SendNUIMessage({ action = "update", showRpm = Config.Display.ShowRpm, showGear = Config.Display.ShowGear, useMetric = Config.UseMetricMeasurements })

    elseif setting == "gear" then
        Config.Display.ShowGear = not Config.Display.ShowGear
        SendNUIMessage({ action = "update", showRpm = Config.Display.ShowRpm, showGear = Config.Display.ShowGear, useMetric = Config.UseMetricMeasurements })

    elseif setting == "sounds" then
        Config.Sound.EnableSounds = not Config.Sound.EnableSounds

    elseif setting == "metric" then
        Config.UseMetricMeasurements = not Config.UseMetricMeasurements
        SendNUIMessage({ action = "update", showRpm = Config.Display.ShowRpm, showGear = Config.Display.ShowGear, useMetric = Config.UseMetricMeasurements })
    end
end, false)

TriggerEvent('chat:addSuggestion', '/' .. Config.ToggleCommand, 'Options: rpm, gear, sounds, metric')
