Config = {}

-- In-Game Command
Config.ToggleCommand = 'speedo'

-- Measurement type: true = KM/H, false = MPH
Config.UseMetricMeasurements = true

-- UI Display Options
Config.Display = {
    ShowRpm  = true,
    ShowGear = true,
}

-- Sound Settings
Config.Sound = {
    EnableSounds = true,
}

-- Fuel System
Config.EnableFuel = true

-- Options: LegacyFuel / cdn-fuel / nd-fuel / ox-fuel / default
Config.FuelSystem = 'default'

Config.GetVehicleFuel = function(vehicle)
    if Config.EnableFuel then
        if DoesEntityExist(vehicle) then
            if Config.FuelSystem == 'LegacyFuel' then
                return exports["LegacyFuel"]:GetFuel(vehicle)
            elseif Config.FuelSystem == 'cdn-fuel' then
                return exports['cdn-fuel']:GetFuel(vehicle)
            elseif Config.FuelSystem == 'nd-fuel' then
                return exports["nd-fuel"]:GetFuel(vehicle)
            elseif Config.FuelSystem == 'ox-fuel' then
                return GetVehicleFuelLevel(vehicle)
            else
                return GetVehicleFuelLevel(vehicle)
            end
        end
    else
        return GetVehicleFuelLevel(vehicle)
    end
end
