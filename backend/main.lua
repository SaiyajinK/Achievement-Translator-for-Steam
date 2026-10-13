local millennium = require('millennium')
local logger = require('logger')
local http = require('http')
local json = require('json')

-- The public GTX gateway is unofficial and may impose rate limits or change.
local ENDPOINT = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'
local function url_encode(s)
  return (s:gsub('[^%w%-_%.~]', function(c)
    return string.format('%%%02X', string.byte(c))
  end))
end

local function run_request(message, target, source)
  if type(message) ~= 'string' or #message == 0 or #message > 3500 then
    return { ok = false, error = 'Invalid text length' }
  end
  if type(target) ~= 'string' or not target:match('^[%a][%a%-]*$') or #target > 10 then
    return { ok = false, error = 'Invalid target language' }
  end
  local sl = 'auto'
  if type(source) == 'string' and source:match('^[%a][%a%-]*$') and #source <= 10 then
    sl = source
  end
  local url = ENDPOINT .. '&sl=' .. url_encode(sl) .. '&tl=' .. url_encode(target) .. '&q=' .. url_encode(message)
  local result, err = http.get(url, {
    timeout = 15, verify_ssl = true,
    headers = { ['Accept'] = 'application/json' },
    user_agent = 'Mozilla/5.0 AchievementTranslator/0.1'
  })
  if not result then return { ok = false, error = tostring(err) } end
  if result.status ~= 200 then return { ok = false, error = 'HTTP ' .. tostring(result.status) } end
  local success, doc = pcall(json.decode, result.body)
  if not success or type(doc) ~= 'table' then
    return { ok = false, error = 'Translation response invalid' }
  end
  -- Google response format: [ [ [translatedChunk, originalChunk, ...], ... ], ..., detectedLanguage ]
  local detected = type(doc[3]) == 'string' and doc[3] or 'und'
  local translated = ''
  if type(doc[1]) == 'table' then
    for _, item in ipairs(doc[1]) do
      if type(item) == 'table' and type(item[1]) == 'string' then
        translated = translated .. item[1]
      end
    end
  end
  if translated == '' then return { ok = false, error = 'Empty translation' } end
  return { ok = true, detected = detected, text = translated }
end

---@ffi
---@param message string
---@param target string
---@param source string
---@return table
function translateAchievementText(message, target, source)
  return run_request(message, target, source)
end

---@ffi
---@param message string
---@param target string
---@return table
function detectAchievementLanguage(message, target)
  local response = run_request(message, target)
  -- Never return translated text during detection (translations are applied on click only).
  if response.ok then return { ok = true, detected = response.detected } end
  return response
end

local function on_load()
  logger:info('Achievement Translator backend ready')
  millennium.ready()
end


-- The Starlight .star package is a file, not a writable plugin directory.
-- Store persistent JSON next to that package in Millennium's plugins folder.
local fs = require('fs')
local CACHE_VERSION = 1
local plugins_folder = nil

local function safe_id(value, expression)
  return type(value) == 'string' and #value < 40 and value:match(expression) ~= nil
end

local function find_plugins_folder()
  if plugins_folder and fs.is_directory(plugins_folder) then return plugins_folder end
  local candidates = {}
  local steam_root = millennium.steam_path()
  if type(steam_root) == 'string' and #steam_root > 0 then
    candidates[#candidates + 1] = fs.join(steam_root, 'millennium', 'plugins')
    candidates[#candidates + 1] = fs.join(steam_root, 'millennium', 'plugin')
  end
  local cwd = fs.current_path()
  if type(cwd) == 'string' and #cwd > 0 then
    if fs.filename(cwd):lower() == 'plugins' and fs.is_directory(cwd) then
      plugins_folder = cwd
      return cwd
    end
    candidates[#candidates + 1] = fs.join(cwd, 'millennium', 'plugins')
    candidates[#candidates + 1] = fs.join(cwd, 'millennium', 'plugin')
  end
  for _, candidate in ipairs(candidates) do
    if fs.is_directory(candidate) then
      plugins_folder = candidate
      return candidate
    end
  end
  return nil
end

local function cache_file(appId, lang)
  if not safe_id(appId, '^%d+$') or not safe_id(lang, '^[a-z][a-z0-9%-]*$') then
    return nil, 'Invalid cache key'
  end
  local base = find_plugins_folder()
  if not base then return nil, 'Cannot locate Millennium plugins directory' end
  local folder = fs.join(base, 'achievement-translator-cache')
  return fs.join(folder, appId .. '_' .. lang .. '.json'), nil, folder
end

---@ffi
---@param appId string
---@param lang string
---@return table
function loadAchievementCache(appId, lang)
  local path, err = cache_file(appId, lang)
  if not path then return {ok = false, error = err} end
  local f = io.open(path, 'rb')
  if not f then return {ok = true} end -- File not yet created.
  local size = f:seek('end') or 0
  if size > 4 * 1024 * 1024 then f:close(); return {ok = false, error = 'Cache too large'} end
  f:seek('set')
  local content = f:read('*a')
  f:close()
  local decoded, value = pcall(json.decode, content)
  if not decoded or type(value) ~= 'table' or value.version ~= CACHE_VERSION or
    value.appId ~= appId or value.language ~= lang then
    return {ok = false, error = 'Cache invalid, incompatible or corrupted'}
  end
  return {ok = true, data = content, path = path}
end

---@ffi
---@param appId string
---@param lang string
---@param contents string
---@return table
function saveAchievementCache(appId, lang, contents)
  local path, err, folder = cache_file(appId, lang)
  if not path then return {ok = false, error = err} end
  if type(contents) ~= 'string' or #contents > 4 * 1024 * 1024 then
    return {ok = false, error = 'Cache payload too large'}
  end
  local decoded, value = pcall(json.decode, contents)
  if not decoded or type(value) ~= 'table' or value.version ~= CACHE_VERSION or
    value.appId ~= appId or value.language ~= lang or type(value.entries) ~= 'table' then
    return {ok = false, error = 'Invalid cache data'}
  end
  local ok, make_err = fs.create_directories(folder)
  if not ok and not fs.is_directory(folder) then return {ok = false, error = tostring(make_err)} end
  local temporary = path .. '.tmp'
  local f, open_err = io.open(temporary, 'wb')
  if not f then return {ok = false, error = tostring(open_err)} end
  local written, write_err = f:write(contents)
  f:close()
  if not written then fs.remove(temporary); return {ok = false, error = tostring(write_err)} end
  -- On Windows rename does not necessarily replace an existing destination:
  -- back up the old file so it can be restored if the new rename fails.
  local backup = path .. '.bak'
  if fs.exists(backup) then fs.remove(backup) end
  if fs.exists(path) then
    local moved, move_err = fs.rename(path, backup, false)
    if not moved then fs.remove(temporary); return {ok = false, error = tostring(move_err)} end
  end
  local saved, save_err = fs.rename(temporary, path, false)
  if not saved then
    if fs.exists(backup) then fs.rename(backup, path, false) end
    fs.remove(temporary)
    return {ok = false, error = tostring(save_err)}
  end
  if fs.exists(backup) then fs.remove(backup) end
  return {ok = true, path = path}
end

return {
  on_load = on_load,
  on_unload = function() logger:info('Achievement Translator stopped') end,
}
